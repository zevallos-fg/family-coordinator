-- Care: health tracking for the grown-ups, starting with Yenny's recovery.
--
-- A person is a family user (users.id). Everything is family-scoped by RLS
-- like the rest of the app. Domain tables owned by the app: a mistyped reading
-- can be corrected or deleted.

-- ── 1. A person's care context ────────────────────────────────────────────────
-- delivered_on drives "day N after birth" and the recovery-phase guidance.
create table if not exists public.care_profiles (
  person_user_id uuid primary key references public.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  delivered_on date,
  delivery_type text check (delivery_type is null or delivery_type in ('vaginal', 'cesarean')),
  bp_reminders boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.care_profiles enable row level security;
create policy care_profiles_read on public.care_profiles for select using (public.fn_user_in_family(family_id));
create policy care_profiles_insert on public.care_profiles for insert with check (public.fn_user_in_family(family_id));
create policy care_profiles_update on public.care_profiles for update
  using (public.fn_user_in_family(family_id)) with check (public.fn_user_in_family(family_id));

-- ── 2. Medicines for a person ────────────────────────────────────────────────
-- Dose is free text, exactly as on the label or as prescribed; the app never
-- computes one.
create table if not exists public.care_medications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  person_user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  dose text,
  interval_hours numeric check (interval_hours is null or (interval_hours > 0 and interval_hours <= 168)),
  purpose text,
  notes text,
  active boolean not null default true,
  written_by text not null default 'app' check (written_by in ('app', 'claude_chat', 'claude_code')),
  created_at timestamptz not null default now()
);
create index if not exists care_medications_person on public.care_medications (person_user_id, active);
alter table public.care_medications enable row level security;
create policy care_medications_read on public.care_medications for select using (public.fn_user_in_family(family_id));
create policy care_medications_insert on public.care_medications for insert with check (public.fn_user_in_family(family_id));
create policy care_medications_update on public.care_medications for update
  using (public.fn_user_in_family(family_id)) with check (public.fn_user_in_family(family_id));

-- ── 3. The log: blood pressure, doses, check-ins, notes ──────────────────────
-- at = when it happened (a reading taken at 9 and typed at 10 is a 9 o'clock reading).
create table if not exists public.care_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  person_user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('bp', 'dose', 'checkin', 'note')),
  at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.users(id) on delete set null,
  written_by text not null default 'app' check (written_by in ('app', 'claude_chat', 'claude_code')),
  created_at timestamptz not null default now(),
  constraint care_logs_bp_shape check (
    kind <> 'bp' or (
      (payload ->> 'systolic') ~ '^[0-9]+$' and (payload ->> 'diastolic') ~ '^[0-9]+$'
      and (payload ->> 'systolic')::int between 50 and 300
      and (payload ->> 'diastolic')::int between 20 and 200
    )
  )
);
create index if not exists care_logs_person_at on public.care_logs (person_user_id, kind, at desc);
alter table public.care_logs enable row level security;
create policy care_logs_read on public.care_logs for select using (public.fn_user_in_family(family_id));
create policy care_logs_insert on public.care_logs for insert with check (public.fn_user_in_family(family_id));
create policy care_logs_update on public.care_logs for update
  using (public.fn_user_in_family(family_id)) with check (public.fn_user_in_family(family_id));
create policy care_logs_delete on public.care_logs for delete using (public.fn_user_in_family(family_id));

-- ── 4. Medicine status: last dose and next due ───────────────────────────────
create or replace view public.v_care_medication_status with (security_invoker = true) as
select m.id, m.family_id, m.person_user_id, u.full_name as person_name, m.name, m.dose,
       m.interval_hours, m.purpose, m.notes, m.active, m.created_at,
       last.at as last_dose_at,
       case when m.interval_hours is not null and last.at is not null
            then last.at + make_interval(secs => (m.interval_hours * 3600)::double precision)
       end as next_due_at
  from public.care_medications m
  left join public.users u on u.id = m.person_user_id
  left join lateral (
    select l.at from public.care_logs l
     where l.kind = 'dose' and l.person_user_id = m.person_user_id
       and l.payload ->> 'medication_id' = m.id::text
     order by l.at desc limit 1
  ) last on true;

-- ── 5. Plan events can be for a grown-up ─────────────────────────────────────
alter table public.family_events add column if not exists person_user_id uuid references public.users(id) on delete set null;

-- ── 6. Push: a person's medicine due, and opt-in BP reminders ──────────────
-- fn_push_outbox is edited in place: the new arms are spliced in ahead of the
-- morning brief, and the block refuses to run if the function body has moved.
do $do$
declare
  d text := pg_get_functiondef('public.fn_push_outbox(text)'::regprocedure);
  anchor text;
  arms text := $n$    union all
    -- A grown-up's medicine whose next dose came due in the last 20 minutes.
    select s.family_id, 'care_medicine', s.id::text || '@' || s.next_due_at::text,
           coalesce(nullif(split_part(s.person_name, ' ', 1), ''), 'Medicine') || ': ' || s.name || ' is due',
           coalesce(s.dose, ''), '/care'
      from public.v_care_medication_status s
     where s.active and s.next_due_at is not null
       and s.next_due_at <= now() and s.next_due_at > now() - interval '20 minutes'
    union all
    -- Opt-in blood pressure reminders at 9am and 9pm local, for six weeks after birth.
    select p.family_id, 'bp_reminder',
           p.person_user_id::text || '@' || to_char(now() at time zone z.tz, 'YYYY-MM-DD HH24'),
           'Blood pressure check', 'Time to take and log a reading.', '/care'
      from public.care_profiles p
      join lateral (select coalesce(f.timezone, 'America/New_York') as tz
                      from public.families f where f.id = p.family_id) z on true
     where p.bp_reminders
       and (p.delivered_on is null or (now() at time zone z.tz)::date <= p.delivered_on + 42)
       and (((now() at time zone z.tz)::time >= time '09:00' and (now() at time zone z.tz)::time < time '09:20')
         or ((now() at time zone z.tz)::time >= time '21:00' and (now() at time zone z.tz)::time < time '21:20'))
$n$;
begin
  if position('care_medicine' in d) > 0 then
    return; -- already applied
  end if;
  -- Production's copy was applied without comments; a fresh build has them.
  anchor := $a$    union all
    select f.id, 'brief'$a$;
  if position(anchor in d) = 0 then
    anchor := $a$    union all
    -- The morning brief, once, in the first 20 minutes after 7:00 local.$a$;
  end if;
  if position(anchor in d) = 0 then
    raise exception 'fn_push_outbox body did not match; not changed';
  end if;
  execute replace(d, anchor, arms || anchor);
end
$do$;

-- ── 7. The brief gains 'care': per person, recent readings, medicines and the
-- latest check-in — what Claude reads before answering a question in chat.
do $do$
declare
  d text := pg_get_functiondef('public.fn_family_brief(uuid)'::regprocedure);
  anchor text := $a$    -- Booked events in the next 30 days, with how far along their prep is.$a$;
  arm text := $n$    'care', (select coalesce(jsonb_agg(jsonb_build_object(
                'person', u.full_name, 'person_user_id', p.person_user_id,
                'delivered_on', p.delivered_on, 'delivery_type', p.delivery_type,
                'days_since_birth', case when p.delivered_on is not null then v_today - p.delivered_on end,
                'bp_recent', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'at', b.at, 'systolic', (b.payload ->> 'systolic')::int,
                                  'diastolic', (b.payload ->> 'diastolic')::int, 'pulse', b.payload -> 'pulse')
                                  order by b.at desc), '[]'::jsonb)
                                from (select * from public.care_logs b2
                                       where b2.person_user_id = p.person_user_id and b2.kind = 'bp'
                                       order by b2.at desc limit 6) b),
                'medicines', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'id', m.id, 'name', m.name, 'dose', m.dose, 'interval_hours', m.interval_hours,
                                  'last_dose_at', m.last_dose_at, 'next_due_at', m.next_due_at)), '[]'::jsonb)
                                from public.v_care_medication_status m
                               where m.person_user_id = p.person_user_id and m.active),
                'last_checkin', (select jsonb_build_object('at', c.at, 'answers', c.payload)
                                   from public.care_logs c
                                  where c.person_user_id = p.person_user_id and c.kind = 'checkin'
                                  order by c.at desc limit 1))), '[]'::jsonb)
              from public.care_profiles p
              left join public.users u on u.id = p.person_user_id
             where p.family_id = p_family_id),
$n$;
begin
  if position('''care''' in d) > 0 then
    return; -- already applied
  end if;
  if position(anchor in d) = 0 then
    raise exception 'fn_family_brief body did not match; not changed';
  end if;
  execute replace(d, anchor, arm || anchor);
end
$do$;
