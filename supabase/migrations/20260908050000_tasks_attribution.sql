-- Attribution columns on `tasks`, so a task can say who made it and what made it.
--
-- Every other table the connector and the app write carries this pair:
--
--   written_by          text NOT NULL DEFAULT 'app'   baby_events, grocery_items,
--                                                     maintenance, memory_corrections,
--                                                     memory_decisions, memory_facts,
--                                                     memory_lexicon
--   created_by_user_id  uuid NULL                     captures, grocery_items,
--                                                     maintenance, receipts, recipes,
--                                                     baby_share_links
--
-- `tasks` is the only write target that has neither, which is why the
-- remember_task tool could not be written without this: it had nowhere to record
-- that a row came from Claude rather than from a person using the app, and
-- nowhere to record which person. Both are the difference between a task you can
-- audit and a task that simply appeared.
--
-- DEFAULT 'app' matches the other seven and is deliberate: existing rows and
-- every app write keep meaning what they already meant, and only a caller that
-- says otherwise is recorded as something else.
--
-- created_by_user_id is nullable, like its six counterparts. A task can predate
-- attribution or arrive from an automated path with no person behind it; a NOT
-- NULL here would be a lie in those cases.

alter table public.tasks
  add column if not exists written_by text not null default 'app',
  add column if not exists created_by_user_id uuid null;

-- Same shape as the other actor columns: point at public.users, and if the
-- person is removed keep the task rather than deleting work by cascade.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_created_by_user_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_created_by_user_id_fkey
      foreign key (created_by_user_id) references public.users(id) on delete set null;
  end if;
end $$;

comment on column public.tasks.written_by is
  'What wrote this row: ''app'' for the Next.js app, ''claude_chat'' for the MCP connector.';
comment on column public.tasks.created_by_user_id is
  'The family member the write was made on behalf of. Null for rows that predate attribution.';

-- v_whats_due selects named columns from tasks and is unaffected by added ones,
-- but it is replaced here so that this migration proves compatibility rather
-- than assuming it: CREATE OR REPLACE VIEW fails if a column name or type has
-- changed underneath it.
create or replace view public.v_whats_due with (security_invoker = true) as
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
    when due_on < current_date then 'overdue'
    when due_on = current_date then 'today'
    when due_on <= (current_date + 7) then 'this_week'
    else 'ahead'
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
  where t.status = any (array['open'::task_status, 'in_progress'::task_status])
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
    d.due_at::date,
    d.owner_user_id,
    false,
    'memory_decisions'::text
  from public.v_memory_decisions_open d
  where d.due_at is not null
) k;
