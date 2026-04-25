-- v33.0.0 Grocery upsert function + ingredient fuzzy search helper
-- Separate migration from schema changes

-- ── Fuzzy ingredient search helper ────────────────────────────────────────────
create or replace function public.fn_ingredient_fuzzy_search(
  p_family_id uuid,
  p_name text,
  p_threshold numeric default 0.6
)
returns table(id uuid, canonical_name text, sim numeric)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.canonical_name, similarity(i.canonical_name, p_name) as sim
  from ingredients i
  where i.family_id = p_family_id
    and i.canonical_name % p_name
    and similarity(i.canonical_name, p_name) >= p_threshold
  order by sim desc
  limit 1;
$$;

grant execute on function public.fn_ingredient_fuzzy_search(uuid, text, numeric) to authenticated;

-- ── Grocery upsert function ────────────────────────────────────────────────────
create or replace function public.fn_grocery_upsert(
  p_family_id uuid,
  p_ingredient_id uuid,
  p_qty_value numeric,
  p_qty_unit text,
  p_store_id uuid,
  p_source_capture_id uuid default null,
  p_raw_name text default null
)
returns table(grocery_item_id uuid, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_new_id uuid;
  v_dedup_group uuid;
begin
  if not fn_user_in_family(p_family_id) then
    raise exception 'access denied: not a member of family %', p_family_id;
  end if;

  if p_ingredient_id is null then
    insert into grocery_items (family_id, name, quantity, qty_value, qty_unit, store_id, source_capture_id)
    values (p_family_id, coalesce(p_raw_name, '(unmatched)'), coalesce(p_qty_value::text, '') || ' ' || coalesce(p_qty_unit, ''), p_qty_value, p_qty_unit, p_store_id, p_source_capture_id)
    returning id into v_new_id;
    return query select v_new_id, 'inserted_unmatched'::text;
    return;
  end if;

  select id, qty_value, qty_unit, store_id, dedup_group_id
  into v_existing
  from grocery_items
  where family_id = p_family_id
    and ingredient_id = p_ingredient_id
    and in_cart = false
    and completed_at is null
  order by created_at asc
  limit 1
  for update;

  if not found then
    insert into grocery_items (family_id, ingredient_id, name, qty_value, qty_unit, store_id, source_capture_id)
    select p_family_id, p_ingredient_id,
           coalesce(p_raw_name, i.canonical_name),
           p_qty_value, p_qty_unit, p_store_id, p_source_capture_id
    from ingredients i where i.id = p_ingredient_id
    returning id into v_new_id;
    return query select v_new_id, 'inserted'::text;
    return;
  end if;

  if v_existing.qty_unit = p_qty_unit or (v_existing.qty_unit is null and p_qty_unit is null) then
    update grocery_items
    set qty_value = coalesce(qty_value, 0) + coalesce(p_qty_value, 0),
        store_id = coalesce(store_id, p_store_id)
    where id = v_existing.id;
    return query select v_existing.id, 'merged'::text;
    return;
  end if;

  if v_existing.dedup_group_id is null then
    v_dedup_group := gen_random_uuid();
    update grocery_items set dedup_group_id = v_dedup_group where id = v_existing.id;
  else
    v_dedup_group := v_existing.dedup_group_id;
  end if;

  insert into grocery_items (family_id, ingredient_id, name, qty_value, qty_unit, store_id, source_capture_id, dedup_group_id, requires_review)
  select p_family_id, p_ingredient_id,
         coalesce(p_raw_name, i.canonical_name),
         p_qty_value, p_qty_unit, p_store_id, p_source_capture_id,
         v_dedup_group, true
  from ingredients i where i.id = p_ingredient_id
  returning id into v_new_id;

  return query select v_new_id, 'review_required'::text;
end;
$$;

grant execute on function public.fn_grocery_upsert(uuid, uuid, numeric, text, uuid, uuid, text) to authenticated;
