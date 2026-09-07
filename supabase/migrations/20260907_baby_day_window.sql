-- Baby lane: the day boundary, and what "today" counts.
--
-- 417 of 1,800 sleeps in the family's own three-year export cross midnight — 23%
-- of them. v_baby_today filtered on `started_at >= date_trunc('day', now())`, so
-- every one of those vanished from "today" at the moment it mattered most: at 7am,
-- looking at the phone, "last sleep" read empty.
--
-- Three separate faults in that one WHERE clause.
--
--   1. The boundary is midnight. A baby's day does not start at midnight, and
--      Huckleberry exposes a Day start time / Midnight toggle for exactly this
--      reason. families.day_start_time (default 07:00) replaces it.
--
--   2. `now()` is evaluated in the server's timezone, which is UTC. For a Miami
--      family that put the boundary at 8pm local the previous evening — so an
--      early-evening feed was already filed under tomorrow, every day, silently.
--      This was not in the brief; it fell out of reading the view definition.
--      families.timezone already exists and is now used.
--
--   3. `started_at >=` asks where an event *began*. A sleep from 19:30 to 06:45
--      began yesterday and is the single most relevant fact on the screen at 7am.
--      The window now counts any event that OVERLAPS it.
--
-- A fourth, found while writing this: fn_baby_log never sets ended_at, so
-- `ended_at IS NULL` means "timer running" OR "point event, which has no end".
-- The old view read it as the former only, and counted every diaper logged today
-- as a feed-or-sleep in progress. The app already draws this distinction by
-- event_type; the view now draws it too, rather than the two disagreeing.
--
-- No change to fn_baby_log or to the ended_at contract: the app documents and
-- relies on "a point event's row stays open forever", and rewriting that would
-- need a backfill of live rows to buy nothing the view cannot fix here.

-- ── 1. The boundary ─────────────────────────────────────────────────────────
alter table public.families
  add column if not exists day_start_time time not null default '07:00';

comment on column public.families.day_start_time is
  'Local wall-clock time at which this family''s day rolls over, in families.timezone. '
  'A baby day runs day_start_time to day_start_time, so a sleep that crosses midnight '
  'belongs to the day it started in. Set to 00:00 for a plain midnight boundary.';

-- ── 2. What "today" means ───────────────────────────────────────────────────
create or replace view public.v_baby_today
with (security_invoker = true) as
with win as (
  select
    f.id as family_id,
    -- The most recent day_start_time that has already happened, in the family's
    -- own zone, converted back to an absolute instant.
    (
      (
        date_trunc('day', (now() at time zone f.timezone) - f.day_start_time::interval)
        + f.day_start_time::interval
      ) at time zone f.timezone
    ) as day_start
  from public.families f
),
ev as (
  select
    e.family_id,
    e.kid_id,
    e.event_type,
    e.started_at,
    e.ended_at,
    w.day_start,
    w.day_start + interval '1 day' as day_end,
    -- Only these four are timed. For everything else the row's open ended_at is
    -- not a running clock, it is the absence of one, and the event is an instant.
    (e.event_type in ('sleep', 'feed', 'pump', 'contraction')) as is_timer,
    case
      when e.event_type in ('sleep', 'feed', 'pump', 'contraction')
        then coalesce(e.ended_at, now())
      else e.started_at
    end as effective_end
  from public.baby_events e
  join win w on w.family_id = e.family_id
)
select
  family_id,
  kid_id,
  event_type,
  max(started_at) as last_at,
  count(*) as count_today,
  count(*) filter (where is_timer and ended_at is null) as in_progress,
  -- Clamped to the window on both ends: last night's sleep belongs to today's
  -- "last sleep", but only the part of it after 07:00 is time slept today.
  sum(
    extract(
      epoch from (
        least(effective_end, day_end) - greatest(started_at, day_start)
      )
    ) / 60::numeric
  )::integer as total_minutes
from ev
where started_at < day_end
  and effective_end >= day_start
group by family_id, kid_id, event_type;

grant select on public.v_baby_today to anon, authenticated, service_role;
