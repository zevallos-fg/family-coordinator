-- Plan: events the family books (checkups, school meetings, anything dated),
-- each with a prep checklist — questions to ask, things to bring — and, after,
-- what was decided. A domain table owned by the app: rows are edited in place
-- (ticking a box is an update), unlike the append-only memory tables.

create table if not exists public.family_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kid_id uuid references public.kids(id) on delete set null,
  kind text not null default 'medical' check (kind in ('medical', 'school', 'activity', 'family', 'other')),
  title text not null check (length(trim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  with_whom text,
  notes text,
  checkpoint_id text references public.age_checkpoints(id),
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  outcome text,
  created_by uuid default auth.uid() references public.users(id) on delete set null,
  written_by text not null default 'app' check (written_by in ('app', 'claude_chat', 'claude_code')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists family_events_family_starts on public.family_events (family_id, starts_at);
alter table public.family_events enable row level security;
create policy family_events_read on public.family_events for select using (public.fn_user_in_family(family_id));
create policy family_events_insert on public.family_events for insert with check (public.fn_user_in_family(family_id));
create policy family_events_update on public.family_events for update
  using (public.fn_user_in_family(family_id)) with check (public.fn_user_in_family(family_id));
create policy family_events_delete on public.family_events for delete using (public.fn_user_in_family(family_id));

create table if not exists public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.family_events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('question', 'bring', 'prep', 'decision')),
  body text not null check (length(trim(body)) > 0),
  -- Why it is on the list, and where that comes from. Template items always carry
  -- a source; the family's own items usually don't.
  detail text,
  source_title text,
  source_url text check (source_url is null or source_url like 'https://%'),
  template_key text,
  done boolean not null default false,
  -- What the doctor or teacher said, captured at the visit.
  answer text,
  position integer not null default 0,
  written_by text not null default 'app' check (written_by in ('app', 'claude_chat', 'claude_code')),
  created_at timestamptz not null default now(),
  unique (event_id, template_key)
);
create index if not exists event_items_event on public.event_items (event_id, position);
alter table public.event_items enable row level security;
create policy event_items_read on public.event_items for select using (public.fn_user_in_family(family_id));
create policy event_items_insert on public.event_items for insert with check (
  public.fn_user_in_family(family_id)
  and exists (select 1 from public.family_events e where e.id = event_id and e.family_id = event_items.family_id));
create policy event_items_update on public.event_items for update
  using (public.fn_user_in_family(family_id)) with check (public.fn_user_in_family(family_id));
create policy event_items_delete on public.event_items for delete using (public.fn_user_in_family(family_id));

-- Saved answers can belong to an event ("researched for the 1-month visit").
alter table public.evidence_cards add column if not exists event_id uuid references public.family_events(id) on delete set null;

create or replace function public.fn_family_events_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger family_events_touch before update on public.family_events
  for each row execute function public.fn_family_events_touch();

-- The brief gains the booked events.
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
                          where family_id = p_family_id order by created_at desc limit 5) c),
    -- Booked events in the next 30 days, with how far along their prep is.
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', ev.id, 'title', ev.title, 'kind', ev.kind, 'kid', k.name, 'kid_id', ev.kid_id,
                  'starts_at', ev.starts_at, 'location', ev.location, 'with', ev.with_whom,
                  'questions', (select count(*) from public.event_items i where i.event_id = ev.id and i.kind = 'question'),
                  'prep_done', (select count(*) from public.event_items i where i.event_id = ev.id and i.done),
                  'prep_total', (select count(*) from public.event_items i where i.event_id = ev.id and i.kind <> 'decision'))
                  order by ev.starts_at), '[]'::jsonb)
                 from public.family_events ev
                 left join public.kids k on k.id = ev.kid_id
                where ev.family_id = p_family_id and ev.status = 'planned'
                  and ev.starts_at >= now() - interval '6 hours'
                  and ev.starts_at < now() + interval '30 days')
  );
end;
$$;
grant execute on function public.fn_family_brief(uuid) to authenticated;
