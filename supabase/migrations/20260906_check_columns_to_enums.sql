-- Convert four CHECK-constrained text columns to native Postgres enums.
--
-- WHY
-- `supabase gen types` cannot see a CHECK constraint, so these four columns were
-- typed `string` and the compiler could not reject a wrong value. Four features
-- shipped strings the database was never going to accept: adding a caregiver,
-- logging a medical event and the entire hurricane checklist could not write a
-- row at all, and trip prep tasks were dropped in silence. PR #9 fixed the values
-- being sent. This makes the same mistake impossible to make again — after the
-- conversion, `supabase gen types` emits a union and a wrong value is a compile
-- error rather than a runtime 500 or a lost row.
--
-- SAFETY
-- Mechanical. At the time of writing the four columns hold one row between them
-- (a single caregiver with role 'nanny'); medical_events, seasonal_checklists and
-- tasks are empty. The DO block below re-checks that at run time and aborts
-- before touching anything if it is no longer true, so this cannot silently
-- discard a row it does not understand.
--
-- NOT AUTOMATICALLY APPLIED. Run against production only on an explicit go.
--
-- VERIFIED BY DRY RUN against the live schema: the whole body ran inside a DO
-- block and rolled back on a deliberate final exception, so nothing persisted
-- (re-checked afterwards: 0 new types, both views present, all four CHECKs
-- present, tasks.status still text). Two dependencies only surfaced that way and
-- are handled in steps 3 and 3b — v_reminders_pending, which sits on top of
-- v_whats_due, and idx_tasks_owner, whose partial-index predicate compares
-- status to text and fails the ALTER with an error naming neither.

begin;

-- ── 1. The types ─────────────────────────────────────────────────────────────
-- Values only, lower_snake, never displayed. Display casing lives in
-- lib/db/enums.ts — putting it on the value is what broke createCaregiver.

create type public.caregiver_role     as enum ('nanny', 'grandparent', 'daycare', 'other');
create type public.medical_event_type as enum ('checkup', 'illness', 'vaccine', 'question', 'other');
create type public.checklist_status   as enum ('open', 'done', 'na');
create type public.task_status        as enum ('open', 'in_progress', 'done', 'cancelled');

-- ── 2. Refuse to run if any existing row would not survive the cast ──────────
-- The USING cast below would fail anyway, but with an error naming a type rather
-- than the rows. This names the rows.

do $guard$
declare
  bad_count bigint;
  bad_values text;
begin
  select count(*), coalesce(string_agg(distinct value, ', '), '')
    into bad_count, bad_values
  from (
    select role  as value from public.caregivers
     where role not in ('nanny', 'grandparent', 'daycare', 'other')
    union all
    select event_type from public.medical_events
     where event_type not in ('checkup', 'illness', 'vaccine', 'question', 'other')
    union all
    select status from public.seasonal_checklists
     where status not in ('open', 'done', 'na')
    union all
    select status from public.tasks
     where status not in ('open', 'in_progress', 'done', 'cancelled')
  ) offenders;

  if bad_count > 0 then
    raise exception
      'refusing to convert: % row(s) hold values outside the new enums (%). Reconcile them first.',
      bad_count, bad_values;
  end if;
end
$guard$;

-- ── 3. Drop the views that depend on tasks.status ────────────────────────────
-- ALTER COLUMN ... TYPE cannot run while a view reads the column. v_whats_due
-- reads tasks.status directly and v_reminders_pending is built on top of it —
-- the second one only showed up when the dry run refused to drop the first.
-- Both are recreated verbatim in step 5, including their security_invoker option
-- and their grants: a recreated view starts with no ACL, and losing them would
-- 403 every /now.

drop view public.v_reminders_pending;
drop view public.v_whats_due;

-- ── 3b. And the one partial index whose predicate compares status to text ────
-- `WHERE status = ANY (ARRAY['open'::text, 'in_progress'::text])` cannot be
-- re-evaluated once the column is an enum, and ALTER COLUMN fails with
-- "operator does not exist: task_status = text" rather than anything that names
-- the index. Plain indexes ON (…, status, …) are rebuilt automatically and need
-- no help; only the predicate is a problem.

drop index public.idx_tasks_owner;

-- ── 4. Convert ───────────────────────────────────────────────────────────────
-- The CHECK goes with it: the type is now the constraint. Defaults have to be
-- dropped before the cast and restored after, or the old `'open'::text` default
-- blocks the type change.

alter table public.caregivers
  drop constraint caregivers_role_check,
  alter column role type public.caregiver_role using role::public.caregiver_role;

alter table public.medical_events
  drop constraint medical_events_event_type_check,
  alter column event_type type public.medical_event_type
    using event_type::public.medical_event_type;

alter table public.seasonal_checklists
  drop constraint seasonal_checklists_status_check,
  alter column status drop default,
  alter column status type public.checklist_status using status::public.checklist_status,
  alter column status set default 'open'::public.checklist_status;

alter table public.tasks
  drop constraint tasks_status_check,
  alter column status drop default,
  alter column status type public.task_status using status::public.task_status,
  alter column status set default 'open'::public.task_status;

-- ── 5. Recreate the view ─────────────────────────────────────────────────────
-- Identical to the previous definition apart from the ARRAY literal, which was
-- `ARRAY['open'::text, 'in_progress'::text]` and would now be comparing an enum
-- against text.

create view public.v_whats_due with (security_invoker = true) as
  select
    kind,
    source_id,
    family_id,
    item,
    detail,
    due_on,
    owner_user_id,
    recurring,
    source_table,
    due_on - current_date as days_until,
    case
      when due_on < current_date then 'overdue'::text
      when due_on = current_date then 'today'::text
      when due_on <= (current_date + 7) then 'this_week'::text
      else 'ahead'::text
    end as bucket
  from (
    select
      'task'::text as kind,
      t.id as source_id,
      t.family_id,
      t.title as item,
      t.description as detail,
      t.due_at::date as due_on,
      t.owner_user_id,
      false as recurring,
      'tasks'::text as source_table
    from public.tasks t
    where t.status = any (array['open'::public.task_status, 'in_progress'::public.task_status])
      and t.due_at is not null
    union all
    select
      'chore'::text,
      m.id,
      m.family_id,
      m.item,
      m.notes,
      m.next_due_at,
      m.owner_user_id,
      true,
      'maintenance'::text
    from public.maintenance m
    union all
    select
      'decision'::text,
      d.id,
      d.family_id,
      d.decision,
      d.context,
      d.due_at::date as due_at,
      d.owner_user_id,
      false,
      'memory_decisions'::text
    from public.v_memory_decisions_open d
    where d.due_at is not null
  ) k;

grant all on public.v_whats_due to anon, authenticated, service_role;

create view public.v_reminders_pending with (security_invoker = true) as
  select
    kind, source_id, family_id, item, detail, due_on, owner_user_id,
    recurring, source_table, days_until, bucket
  from public.v_whats_due d
  where due_on <= (current_date + 14)
    and not exists (
      select 1
        from public.reminder_log r
       where r.source_table = d.source_table
         and r.source_id = d.source_id
         and r.due_on = d.due_on
         and r.channel = 'calendar'::text
    );

grant all on public.v_reminders_pending to anon, authenticated, service_role;

-- Same index, same shape, predicate now in the column's own type.
create index idx_tasks_owner on public.tasks using btree (owner_user_id, due_at)
  where (status = any (array['open'::public.task_status, 'in_progress'::public.task_status]));

-- ── 6. The two functions that hand tasks.status back as text ─────────────────
-- Signatures are unchanged on purpose: they are called from the client through
-- PostgREST, so `RETURNS TABLE(..., status text, ...)` has to stay text. Only the
-- select gains a cast, which without it would raise "structure of query does not
-- match function result type" on the first call after the conversion.

create or replace function public.fn_task_done(p_task_id uuid)
 returns table(title text, status text, completed_at timestamp with time zone)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.tasks t
     set status = 'done', completed_at = now()
   where t.id = p_task_id and t.status <> 'done';

  if not found then
    raise exception 'task % not found, not visible to you, or already done', p_task_id
      using errcode = 'no_data_found';
  end if;

  return query select t.title, t.status::text, t.completed_at
                 from public.tasks t where t.id = p_task_id;
end $function$;

create or replace function public.fn_task_undo(p_task_id uuid)
 returns table(title text, status text)
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.tasks t set status = 'open', completed_at = null
   where t.id = p_task_id and t.status = 'done';
  if not found then
    raise exception 'task % not found, not yours, or not done', p_task_id
      using errcode = 'no_data_found';
  end if;
  return query select t.title, t.status::text from public.tasks t where t.id = p_task_id;
end $function$;

commit;

-- PostgREST caches the schema, and the new column types will not appear in its
-- OpenAPI output — or in `supabase gen types` — until it reloads.
notify pgrst, 'reload schema';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Symmetrical, and equally mechanical. Every enum label is a valid text value,
-- so the reverse cast cannot lose a row.
--
--   begin;
--     drop view public.v_reminders_pending;
--     drop view public.v_whats_due;
--     drop index public.idx_tasks_owner;
--
--     alter table public.caregivers
--       alter column role type text using role::text,
--       add constraint caregivers_role_check
--         check (role = any (array['nanny','grandparent','daycare','other']));
--
--     alter table public.medical_events
--       alter column event_type type text using event_type::text,
--       add constraint medical_events_event_type_check
--         check (event_type = any (array['checkup','illness','vaccine','question','other']));
--
--     alter table public.seasonal_checklists
--       alter column status drop default,
--       alter column status type text using status::text,
--       alter column status set default 'open'::text,
--       add constraint seasonal_checklists_status_check
--         check (status = any (array['open','done','na']));
--
--     alter table public.tasks
--       alter column status drop default,
--       alter column status type text using status::text,
--       alter column status set default 'open'::text,
--       add constraint tasks_status_check
--         check (status = any (array['open','in_progress','done','cancelled']));
--
--     -- then recreate both views and idx_tasks_owner with ::text predicates,
--     -- re-grant them, and restore fn_task_done / fn_task_undo without the
--     -- ::text casts (harmless to leave in place, so simplest to leave them).
--
--     drop type public.caregiver_role;
--     drop type public.medical_event_type;
--     drop type public.checklist_status;
--     drop type public.task_status;
--   commit;
--   notify pgrst, 'reload schema';
