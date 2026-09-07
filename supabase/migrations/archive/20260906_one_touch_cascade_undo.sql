-- One-touch undo, made honest.
--
-- fn_soft_delete banked only the parent row. Two of the six whitelisted tables cascade:
--
--   recipes    -> recipe_ingredients                              (CASCADE)
--              -> meal_plan_entries.recipe_id                     (SET NULL)
--   caregivers -> caregiver_shifts, caregiver_timesheets,
--                 caregiver_mileage                               (CASCADE)
--              -> caregiver_shifts -> shift_briefs, shift_recaps  (CASCADE, depth 2)
--
-- So an Undo button on those returned an ingredient-less recipe, or a caregiver with no
-- shift history and no timesheets. Restoring the parent and calling it undone is a worse
-- failure than refusing to offer undo at all, because the user is told they got it back.
--
-- This captures the whole subtree before the delete and replays it on restore.
--
-- The edges are read from pg_constraint at run time, not hardcoded. A hand-maintained
-- list beside a schema that moves is the same bug in slower motion: add a cascading
-- child table next month and a literal list silently starts losing it again.
--
-- Signatures are unchanged (uuid in, uuid out), so no client or generated type changes.

-- ---------------------------------------------------------------- storage

alter table public.deleted_items
  add column if not exists children jsonb;

comment on column public.deleted_items.children is
  'Captured subtree for an undoable delete: {"cascade":[{"table","rows"}...] (shallow->deep), '
  '"relink":[{"table","column","ids"}...]}. NULL for rows banked before cascade capture existed, '
  'and for parents that have no cascading children.';

-- ---------------------------------------------------------------- soft delete

create or replace function public.fn_soft_delete(p_table text, p_row_id uuid)
returns uuid
language plpgsql
as $$
declare
  rec        jsonb;
  fam        uuid;
  trash      uuid;
  cascade_out jsonb := '[]'::jsonb;
  relink_out  jsonb := '[]'::jsonb;
  frontier   jsonb;
  next_front jsonb := '[]'::jsonb;
  node       jsonb;
  edge       record;
  child_rows jsonb;
  child_ids  uuid[];
  cur_ids    uuid[];
  cur_tbl    text;
  depth      int := 0;
begin
  if p_table not in ('grocery_items','recipes','pantry_items','caregivers','baby_events','tasks') then
    raise exception 'table % is not eligible for undo-able delete', p_table
      using errcode = 'invalid_parameter_value';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table)
    into rec using p_row_id;

  if rec is null then
    raise exception 'row % not found in table % or not visible to you', p_row_id, p_table
      using errcode = 'no_data_found';
  end if;

  fam := (rec->>'family_id')::uuid;

  -- Walk the cascade subtree breadth-first, capturing rows shallow->deep so restore can
  -- replay them in the same order and never insert a child before its parent exists.
  frontier := jsonb_build_array(jsonb_build_object('table', p_table, 'ids', to_jsonb(array[p_row_id])));

  while jsonb_array_length(frontier) > 0 and depth < 6 loop
    next_front := '[]'::jsonb;

    for node in select * from jsonb_array_elements(frontier) loop
      cur_tbl := node->>'table';
      select array_agg(value::text::uuid) into cur_ids
        from jsonb_array_elements_text(node->'ids') as value;

      for edge in
        select src.relname as child,
               att.attname as fk_col,
               con.confdeltype as del_type,
               -- does the child carry its own id? recipe_ingredients does not
               exists (select 1 from pg_attribute a2
                        where a2.attrelid = src.oid and a2.attname = 'id'
                          and a2.attnum > 0 and not a2.attisdropped) as child_has_id,
               -- does the child itself cascade further? only then must we recurse
               exists (select 1 from pg_constraint c2
                        where c2.contype = 'f' and c2.confrelid = src.oid
                          and c2.confdeltype = 'c') as child_cascades
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class tgt on tgt.oid = con.confrelid
        join pg_namespace n on n.oid = tgt.relnamespace and n.nspname = 'public'
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
        where con.contype = 'f'
          and tgt.relname = cur_tbl
          and con.confdeltype in ('c','n')
          and array_length(con.conkey, 1) = 1   -- composite FKs are out of scope; none exist here
        order by src.relname
      loop
        if edge.del_type = 'n' then
          -- SET NULL: the row survives but loses its link. Remember which rows pointed
          -- here so restore can point them back.
          if edge.child_has_id then
            execute format('select array_agg(t.id) from public.%I t where t.%I = any($1)',
                           edge.child, edge.fk_col)
              into child_ids using cur_ids;
            if child_ids is not null and array_length(child_ids, 1) > 0 then
              relink_out := relink_out || jsonb_build_object(
                'table', edge.child, 'column', edge.fk_col, 'ids', to_jsonb(child_ids));
            end if;
          end if;

        else
          -- CASCADE: these rows are about to be destroyed. Bank them.
          execute format('select jsonb_agg(to_jsonb(t)) from public.%I t where t.%I = any($1)',
                         edge.child, edge.fk_col)
            into child_rows using cur_ids;

          if child_rows is not null then
            cascade_out := cascade_out || jsonb_build_object('table', edge.child, 'rows', child_rows);

            if edge.child_has_id and edge.child_cascades then
              execute format('select array_agg(t.id) from public.%I t where t.%I = any($1)',
                             edge.child, edge.fk_col)
                into child_ids using cur_ids;
              if child_ids is not null and array_length(child_ids, 1) > 0 then
                next_front := next_front || jsonb_build_object(
                  'table', edge.child, 'ids', to_jsonb(child_ids));
              end if;
            end if;
          end if;
        end if;
      end loop;
    end loop;

    frontier := next_front;
    depth := depth + 1;
  end loop;

  insert into public.deleted_items
    (family_id, source_table, row_id, row_data, deleted_by_user_id, children)
  values
    (fam, p_table, p_row_id, rec, auth.uid(),
     case when cascade_out = '[]'::jsonb and relink_out = '[]'::jsonb
          then null
          else jsonb_build_object('cascade', cascade_out, 'relink', relink_out) end)
  returning id into trash;

  begin
    execute format('delete from public.%I where id = $1', p_table) using p_row_id;
  exception when foreign_key_violation then
    -- e.g. recipes referenced by meal_log (NO ACTION), baby_events by baby_predictions.
    -- Nothing is banked or deleted: this raise aborts the whole function's transaction.
    raise exception 'this % is still referenced by other records and can''t be removed yet', p_table
      using errcode = 'foreign_key_violation';
  end;

  return trash;
end $$;

-- ---------------------------------------------------------------- restore

create or replace function public.fn_restore(p_trash_id uuid)
returns uuid
language plpgsql
as $$
declare
  d     record;
  entry jsonb;
  ids   uuid[];
begin
  select * into d from public.deleted_items
   where id = p_trash_id and restored_at is null and expires_at > now();
  if not found then
    raise exception 'nothing to restore for % - already restored, expired, or not yours', p_trash_id
      using errcode = 'no_data_found';
  end if;

  -- Parent first: the children's foreign keys point at it.
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    d.source_table, d.source_table) using d.row_data;

  -- Then the captured subtree, in the shallow->deep order it was banked in.
  if d.children is not null then
    for entry in select * from jsonb_array_elements(coalesce(d.children->'cascade', '[]'::jsonb)) loop
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
        entry->>'table', entry->>'table') using entry->'rows';
    end loop;

    -- Finally re-point the rows that were only unlinked, never deleted.
    for entry in select * from jsonb_array_elements(coalesce(d.children->'relink', '[]'::jsonb)) loop
      select array_agg(value::text::uuid) into ids
        from jsonb_array_elements_text(entry->'ids') as value;
      execute format('update public.%I set %I = $1 where id = any($2)',
                     entry->>'table', entry->>'column')
        using d.row_id, ids;
    end loop;
  end if;

  update public.deleted_items set restored_at = now() where id = p_trash_id;
  return d.row_id;
end $$;
