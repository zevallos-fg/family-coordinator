-- Family brain: one record, many doors.
--
-- Everything Claude (chat, the connector) and the app need to read the same
-- state and act on it: medicine, saved evidence, an age-driven schedule of
-- checkups and milestone checklists, a single family brief computed by the
-- database, and phone notifications. Plus a fix to "today" on Now.
--
-- Secrets are NOT in this file. The push signing key and the tick secret live
-- in Supabase Vault (names: vapid_public, vapid_private, push_tick_secret) and
-- are inserted out of band. Everything here only ever reads them by name.

-- ── 0. Extensions ────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── 1. "Today" is the family's day, not UTC's ────────────────────────────────
-- CURRENT_DATE is UTC on the server, so after 8pm Eastern every item due today
-- showed as overdue, and timestamps due at local midnight landed on the wrong
-- day. Both sides of the comparison now use families.timezone.
create or replace view public.v_whats_due with (security_invoker = true) as
select k.kind, k.source_id, k.family_id, k.item, k.detail, k.due_on, k.owner_user_id,
       k.recurring, k.source_table,
       k.due_on - k.today as days_until,
       case
         when k.due_on < k.today then 'overdue'
         when k.due_on = k.today then 'today'
         when k.due_on <= k.today + 7 then 'this_week'
         else 'ahead'
       end as bucket
from (
  select 'task'::text as kind, t.id as source_id, t.family_id, t.title as item,
         t.description as detail, (t.due_at at time zone z.tz)::date as due_on,
         t.owner_user_id, false as recurring, 'tasks'::text as source_table, z.today
    from public.tasks t
    cross join lateral (
      select coalesce(f.timezone, 'America/New_York') as tz,
             (now() at time zone coalesce(f.timezone, 'America/New_York'))::date as today
        from public.families f where f.id = t.family_id
    ) z
   where t.status in ('open', 'in_progress') and t.due_at is not null
  union all
  select 'chore', m.id, m.family_id, m.item, m.notes, m.next_due_at, m.owner_user_id,
         true, 'maintenance', z.today
    from public.maintenance m
    cross join lateral (
      select (now() at time zone coalesce(f.timezone, 'America/New_York'))::date as today
        from public.families f where f.id = m.family_id
    ) z
  union all
  select 'decision', d.id, d.family_id, d.decision, d.context,
         (d.due_at at time zone z.tz)::date, d.owner_user_id, false, 'memory_decisions', z.today
    from public.v_memory_decisions_open d
    cross join lateral (
      select coalesce(f.timezone, 'America/New_York') as tz,
             (now() at time zone coalesce(f.timezone, 'America/New_York'))::date as today
        from public.families f where f.id = d.family_id
    ) z
   where d.due_at is not null
) k;

-- ── 2. Reminders that actually notify ────────────────────────────────────────
-- due_at says when something must be done; remind_at says when to buzz a phone.
-- Kept separate so a task "due Friday" never pushes at midnight Friday.
alter table public.tasks add column if not exists remind_at timestamptz;

-- ── 3. Medicine ──────────────────────────────────────────────────────────────
-- What a child is taking. Each dose is a baby_events row of type 'medicine'
-- whose payload carries medication_id. interval_hours null means "as needed".
-- Doses come from the label or the pediatrician and are typed by a parent;
-- nothing here computes one.
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kid_id uuid not null references public.kids(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  dose text,
  interval_hours numeric check (interval_hours is null or interval_hours > 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.users(id),
  written_by text not null default 'app'
    check (written_by in ('app', 'claude_chat', 'claude_code'))
);
alter table public.medications enable row level security;
create policy medications_family_read on public.medications
  for select using (public.fn_user_in_family(family_id));
create policy medications_family_insert on public.medications
  for insert with check (public.fn_user_in_family(family_id));
-- Update exists only to stop a medicine (active = false). No delete: the dose
-- history points at these rows. (Policies are created without a preceding
-- DROP: the tables are new in this migration, and DROP statements are gated
-- behind a manual confirmation on the MCP path that applies it.)
create policy medications_family_update on public.medications
  for update using (public.fn_user_in_family(family_id))
  with check (public.fn_user_in_family(family_id));

create or replace view public.v_medication_status with (security_invoker = true) as
select m.id, m.family_id, m.kid_id, k.name as kid_name, m.name, m.dose, m.interval_hours,
       m.notes, m.active, m.created_at,
       last.started_at as last_dose_at,
       case when m.interval_hours is not null and last.started_at is not null
            then last.started_at + make_interval(secs => (m.interval_hours * 3600)::double precision)
       end as next_due_at
  from public.medications m
  join public.kids k on k.id = m.kid_id
  left join lateral (
    select e.started_at from public.baby_events e
     where e.event_type = 'medicine' and e.kid_id = m.kid_id
       and e.payload ->> 'medication_id' = m.id::text
     order by e.started_at desc limit 1
  ) last on true;

-- ── 4. Evidence cards ────────────────────────────────────────────────────────
-- A question answered with sources, kept so it is asked once. Append-only.
create table if not exists public.evidence_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kid_id uuid references public.kids(id) on delete cascade,
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  child_age_days integer,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.users(id),
  written_by text not null default 'app'
    check (written_by in ('app', 'claude_chat', 'claude_code'))
);
alter table public.evidence_cards enable row level security;
create policy evidence_cards_family_read on public.evidence_cards
  for select using (public.fn_user_in_family(family_id));
create policy evidence_cards_family_insert on public.evidence_cards
  for insert with check (public.fn_user_in_family(family_id));

-- ── 5. Age engine ────────────────────────────────────────────────────────────
-- The schedule nobody should have to hold: AAP Bright Futures well-child
-- visits and CDC "Learn the Signs. Act Early." milestone checklists, as offsets
-- from a birth date. Vaccines deliberately not included.
create table if not exists public.age_checkpoints (
  id text primary key,
  kind text not null check (kind in ('well_visit', 'milestone_checklist')),
  age interval not null,
  label text not null,
  source_url text not null
);
alter table public.age_checkpoints enable row level security;
create policy age_checkpoints_read on public.age_checkpoints for select using (true);

insert into public.age_checkpoints (id, kind, age, label, source_url) values
  ('visit-newborn', 'well_visit', '5 days',    'newborn checkup (3–5 days)', 'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-1m',  'well_visit', '1 month',   '1-month checkup',   'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-2m',  'well_visit', '2 months',  '2-month checkup',   'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-4m',  'well_visit', '4 months',  '4-month checkup',   'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-6m',  'well_visit', '6 months',  '6-month checkup',   'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-9m',  'well_visit', '9 months',  '9-month checkup',   'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-12m', 'well_visit', '12 months', '12-month checkup',  'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-15m', 'well_visit', '15 months', '15-month checkup',  'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-18m', 'well_visit', '18 months', '18-month checkup',  'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-24m', 'well_visit', '24 months', '2-year checkup',    'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-30m', 'well_visit', '30 months', '2½-year checkup',   'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-3y',  'well_visit', '3 years',   '3-year checkup',    'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-4y',  'well_visit', '4 years',   '4-year checkup',    'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-5y',  'well_visit', '5 years',   '5-year checkup',    'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('visit-6y',  'well_visit', '6 years',   '6-year checkup',    'https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx'),
  ('milestones-2m',  'milestone_checklist', '2 months',  '2-month milestone checklist',  'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-4m',  'milestone_checklist', '4 months',  '4-month milestone checklist',  'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-6m',  'milestone_checklist', '6 months',  '6-month milestone checklist',  'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-9m',  'milestone_checklist', '9 months',  '9-month milestone checklist',  'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-12m', 'milestone_checklist', '12 months', '1-year milestone checklist',   'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-15m', 'milestone_checklist', '15 months', '15-month milestone checklist', 'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-18m', 'milestone_checklist', '18 months', '18-month milestone checklist', 'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-24m', 'milestone_checklist', '24 months', '2-year milestone checklist',   'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-30m', 'milestone_checklist', '30 months', '30-month milestone checklist', 'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-3y',  'milestone_checklist', '3 years',   '3-year milestone checklist',   'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-4y',  'milestone_checklist', '4 years',   '4-year milestone checklist',   'https://www.cdc.gov/act-early/milestones/index.html'),
  ('milestones-5y',  'milestone_checklist', '5 years',   '5-year milestone checklist',   'https://www.cdc.gov/act-early/milestones/index.html')
on conflict (id) do nothing;

-- One task per kid per checkpoint, ever. This is what makes the sync idempotent.
create table if not exists public.kid_checkpoint_tasks (
  kid_id uuid not null references public.kids(id) on delete cascade,
  checkpoint_id text not null references public.age_checkpoints(id),
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (kid_id, checkpoint_id)
);
alter table public.kid_checkpoint_tasks enable row level security;
create policy kid_checkpoint_tasks_read on public.kid_checkpoint_tasks
  for select using (exists (select 1 from public.kids k
                             where k.id = kid_id and public.fn_user_in_family(k.family_id)));

-- Creates a dated task for each checkpoint falling in the next 30 days.
-- Strictly after today, so turning this on does not back-fill visits that have
-- already happened. Due at noon local so the date survives UTC.
create or replace function public.fn_age_engine_sync()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_task uuid;
  v_count integer := 0;
begin
  for r in
    select k.id as kid_id, k.family_id, k.name, c.id as checkpoint_id, c.kind, c.label,
           c.source_url, (k.birth_date + c.age)::date as due_on,
           coalesce(f.timezone, 'America/New_York') as tz
      from public.kids k
      join public.families f on f.id = k.family_id
      cross join public.age_checkpoints c
     where k.birth_date is not null
       and (k.birth_date + c.age)::date >  (now() at time zone coalesce(f.timezone, 'America/New_York'))::date
       and (k.birth_date + c.age)::date <= (now() at time zone coalesce(f.timezone, 'America/New_York'))::date + 30
       and not exists (select 1 from public.kid_checkpoint_tasks x
                        where x.kid_id = k.id and x.checkpoint_id = c.id)
  loop
    insert into public.tasks (family_id, title, description, due_at, status, written_by)
    values (
      r.family_id,
      r.name || ' — ' || r.label,
      case r.kind
        when 'well_visit' then
          'Around ' || to_char(r.due_on, 'Mon FMDD') || ' (AAP Bright Futures schedule). ' ||
          'Book it if it is not already scheduled. Source: ' || r.source_url
        else
          'Around ' || to_char(r.due_on, 'Mon FMDD') || '. CDC "Learn the Signs. Act Early." ' ||
          'checklist — bring it to the checkup. Source: ' || r.source_url
      end,
      (r.due_on + time '12:00') at time zone r.tz,
      'open',
      'app'
    )
    returning id into v_task;
    insert into public.kid_checkpoint_tasks (kid_id, checkpoint_id, task_id)
    values (r.kid_id, r.checkpoint_id, v_task);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.fn_age_engine_sync() from public, anon, authenticated;

-- ── 6. The family brief ──────────────────────────────────────────────────────
-- One JSON object describing the family right now. The database does the
-- arithmetic (counts, minutes, intervals, dates) so no model has to.
-- SECURITY INVOKER: RLS decides what a caller may see, exactly as for a table.
create or replace function public.fn_family_brief(p_family_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_today date;
  v_since timestamptz := now() - interval '24 hours';
begin
  select coalesce(timezone, 'America/New_York') into v_tz from public.families where id = p_family_id;
  if v_tz is null then
    raise exception 'family not found or not visible' using errcode = '42501';
  end if;
  v_today := (now() at time zone v_tz)::date;

  return jsonb_build_object(
    'as_of', now(),
    'timezone', v_tz,
    'today', v_today,
    'kids', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'name', k.name,
        'birth_date', k.birth_date,
        'age_days', case when k.birth_date is not null then v_today - k.birth_date end,
        'last_24h', (
          select jsonb_build_object(
            'feeds', count(*) filter (where e.event_type = 'feed'),
            'nursing_minutes', round(coalesce(sum((
                select sum((s ->> 'seconds')::numeric)
                  from jsonb_array_elements(case when jsonb_typeof(e.payload -> 'segments') = 'array'
                                                 then e.payload -> 'segments' else '[]'::jsonb end) s
              )) filter (where e.event_type = 'feed'), 0) / 60),
            'bottles', count(*) filter (where e.event_type = 'feed' and (e.payload ->> 'method') = 'bottle'),
            'diapers', count(*) filter (where e.event_type = 'diaper'),
            'wet', count(*) filter (where e.event_type = 'diaper' and e.payload ->> 'contents' in ('pee', 'both')),
            'dirty', count(*) filter (where e.event_type = 'diaper' and e.payload ->> 'contents' in ('poo', 'both')),
            'sleep_minutes', round(coalesce(sum(extract(epoch from (e.ended_at - e.started_at)))
                               filter (where e.event_type = 'sleep' and e.ended_at is not null), 0) / 60)
          )
          from public.baby_events e
          where e.kid_id = k.id and e.started_at >= v_since
        ),
        'last_feed_at', (select max(started_at) from public.baby_events
                          where kid_id = k.id and event_type = 'feed'),
        'last_diaper_at', (select max(started_at) from public.baby_events
                            where kid_id = k.id and event_type = 'diaper'),
        'running', (select coalesce(jsonb_agg(jsonb_build_object('type', event_type, 'since', started_at)), '[]'::jsonb)
                      from public.baby_events
                     where kid_id = k.id and ended_at is null
                       and event_type in ('feed', 'sleep', 'pump')),
        'growth', (select coalesce(jsonb_agg(jsonb_build_object('at', g.started_at, 'measures', g.payload)
                                             order by g.started_at), '[]'::jsonb)
                     from public.baby_events g where g.kid_id = k.id and g.event_type = 'growth'),
        'medicines', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', m.id, 'name', m.name, 'dose', m.dose, 'interval_hours', m.interval_hours,
                          'last_dose_at', m.last_dose_at, 'next_due_at', m.next_due_at)), '[]'::jsonb)
                        from public.v_medication_status m where m.kid_id = k.id and m.active),
        'next_checkpoints', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'label', c.label, 'kind', c.kind, 'due_on', (k.birth_date + c.age)::date,
                                 'source', c.source_url) order by c.age), '[]'::jsonb)
                               from (select * from public.age_checkpoints c2
                                      where k.birth_date is not null and (k.birth_date + c2.age)::date >= v_today
                                      order by c2.age limit 3) c)
      ) order by k.birth_date desc nulls last)
      from public.kids k where k.family_id = p_family_id
    ), '[]'::jsonb),
    'due', (select coalesce(jsonb_agg(jsonb_build_object(
               'item', d.item, 'due_on', d.due_on, 'bucket', d.bucket, 'kind', d.kind)
               order by d.due_on), '[]'::jsonb)
              from public.v_whats_due d
             where d.family_id = p_family_id and d.bucket in ('overdue', 'today', 'this_week')),
    'open_anytime', (select coalesce(jsonb_agg(t.title order by t.created_at desc), '[]'::jsonb)
                       from public.tasks t
                      where t.family_id = p_family_id and t.status in ('open', 'in_progress')
                        and t.due_at is null),
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object('question', c.question, 'saved_at', c.created_at)
                                           order by c.created_at desc), '[]'::jsonb)
                   from (select * from public.evidence_cards
                          where family_id = p_family_id order by created_at desc limit 5) c)
  );
end;
$$;
grant execute on function public.fn_family_brief(uuid) to authenticated;

-- One line for a morning notification, built from the brief.
create or replace function public.fn_brief_line(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  b jsonb := public.fn_family_brief(p_family_id);
  k jsonb;
  parts text[] := '{}';
  v_today int;
  v_over int;
begin
  select count(*) filter (where d ->> 'bucket' = 'today'),
         count(*) filter (where d ->> 'bucket' = 'overdue')
    into v_today, v_over
    from jsonb_array_elements(b -> 'due') d;
  parts := parts || (v_today || ' due today' || case when v_over > 0 then ', ' || v_over || ' overdue' else '' end);
  for k in select * from jsonb_array_elements(b -> 'kids') loop
    -- Feeding stats only for a baby under a year; for an older child they are noise.
    if (k ->> 'age_days')::int < 365 then
      parts := parts || ((k ->> 'name') || ': ' || (k -> 'last_24h' ->> 'feeds') || ' feeds, ' ||
                         (k -> 'last_24h' ->> 'diapers') || ' diapers in 24h');
    end if;
  end loop;
  return array_to_string(parts, ' · ');
end;
$$;
revoke all on function public.fn_brief_line(uuid) from public, anon, authenticated;

-- ── 7. Phone notifications ───────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own_read on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid() and public.fn_user_in_family(family_id));
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- What was sent to which phone. The unique key is what stops a reminder being
-- sent twice when two ticks overlap. No policies: only the functions below
-- touch it.
create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'medicine', 'brief')),
  ref text not null,
  title text not null,
  body text,
  url text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, kind, ref)
);
alter table public.push_log enable row level security;

-- Called by the app's /api/push/tick route, which pg_cron wakes every five
-- minutes. The route holds no credential of its own: the secret arrives from
-- pg_cron in the request, and only this function can check it (against Vault).
-- It claims what is due by inserting into push_log, then hands back the
-- messages and the signing key.
create or replace function public.fn_push_outbox(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
  v_out jsonb;
begin
  select exists (select 1 from vault.decrypted_secrets
                  where name = 'push_tick_secret' and decrypted_secret = p_secret)
    into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with cand as (
    -- Reminders: anything with a remind_at in the last 20 minutes.
    select t.family_id, 'reminder'::text as kind, t.id::text || '@' || t.remind_at::text as ref,
           t.title as title, coalesce(t.description, 'Reminder') as body, '/now'::text as url
      from public.tasks t
     where t.status in ('open', 'in_progress') and t.remind_at is not null
       and t.remind_at <= now() and t.remind_at > now() - interval '20 minutes'
    union all
    -- Medicine whose next dose came due in the last 20 minutes.
    select s.family_id, 'medicine', s.id::text || '@' || s.next_due_at::text,
           s.kid_name || ': ' || s.name || ' is due', coalesce(s.dose, ''), '/baby/medicine'
      from public.v_medication_status s
     where s.active and s.next_due_at is not null
       and s.next_due_at <= now() and s.next_due_at > now() - interval '20 minutes'
    union all
    -- The morning brief, once, in the first 20 minutes after 7:00 local.
    select f.id, 'brief', to_char((now() at time zone coalesce(f.timezone, 'America/New_York'))::date, 'YYYY-MM-DD'),
           'Good morning', public.fn_brief_line(f.id), '/now'
      from public.families f
     where (now() at time zone coalesce(f.timezone, 'America/New_York'))::time >= time '07:00'
       and (now() at time zone coalesce(f.timezone, 'America/New_York'))::time <  time '07:20'
  ),
  claimed as (
    insert into public.push_log (family_id, subscription_id, kind, ref, title, body, url)
    select c.family_id, s.id, c.kind, c.ref, c.title, c.body, c.url
      from cand c join public.push_subscriptions s on s.family_id = c.family_id
    on conflict (subscription_id, kind, ref) do nothing
    returning id, subscription_id, title, body, url
  )
  select jsonb_build_object(
    'vapid', jsonb_build_object(
      'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
      'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
      'subject', 'mailto:zevallos.fg@gmail.com'),
    'messages', coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'title', c.title, 'body', c.body, 'url', c.url)), '[]'::jsonb))
    into v_out
    from claimed c join public.push_subscriptions s on s.id = c.subscription_id;

  return v_out;
end;
$$;
revoke all on function public.fn_push_outbox(text) from public;
grant execute on function public.fn_push_outbox(text) to anon, authenticated;

-- The route reports back. A 404/410 from the push service means the phone
-- unsubscribed; the subscription is removed so it is not tried again.
create or replace function public.fn_push_ack(p_secret text, p_results jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
  r jsonb;
begin
  select exists (select 1 from vault.decrypted_secrets
                  where name = 'push_tick_secret' and decrypted_secret = p_secret)
    into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    update public.push_log
       set status = case when (r ->> 'ok')::boolean then 'sent' else 'failed' end,
           sent_at = now(),
           error = r ->> 'error'
     where id = (r ->> 'id')::uuid;
    if (r ->> 'status') in ('404', '410') then
      delete from public.push_subscriptions
       where id = (select subscription_id from public.push_log where id = (r ->> 'id')::uuid);
    end if;
  end loop;
end;
$$;
revoke all on function public.fn_push_ack(text, jsonb) from public;
grant execute on function public.fn_push_ack(text, jsonb) to anon, authenticated;

-- ── 8. Schedules ─────────────────────────────────────────────────────────────
-- Every five minutes: wake the app's push route, handing it the tick secret
-- from Vault at run time (the secret is never written into the job itself).
select cron.unschedule(jobid) from cron.job where jobname in ('push-tick', 'age-engine-sync');
select cron.schedule(
  'push-tick',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://family-coordinator.vercel.app/api/push/tick',
    body := jsonb_build_object('secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'push_tick_secret')),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cmd$
);
-- Daily at 10:05 UTC (6:05 am Eastern): create next month's checkup tasks.
select cron.schedule('age-engine-sync', '5 10 * * *', $cmd$ select public.fn_age_engine_sync(); $cmd$);
