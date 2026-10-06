-- Food and movement for the grown-ups, on the care log.
--
-- Food and movement entries are two more kinds of care_logs row, so they get
-- the same family RLS, the same edit/delete, and land in the same brief Claude
-- reads. Personal goals (her calorie goal, any target her OB or a dietitian
-- sets) reuse person_nutrition_targets: append a row with a start_date; the
-- latest one in effect wins. Default lactation targets live in code
-- (lib/care/nutrition.ts) with their sources, not in the database.
--
-- Wearables (Oura, Whoop) will write movement rows with payload.source set to
-- 'oura' or 'whoop'; nothing here needs to change for that.

-- ── 1. Two new kinds, with shape checks ──────────────────────────────────────
alter table public.care_logs
  drop constraint if exists care_logs_kind_check,
  add constraint care_logs_kind_check check (kind in ('bp', 'dose', 'checkin', 'note', 'food', 'move'));

alter table public.care_logs
  add constraint care_logs_food_shape check (
    kind <> 'food' or (
      length(trim(coalesce(payload ->> 'name', ''))) > 0
      and jsonb_typeof(payload -> 'nutrients') = 'object'
    )
  ),
  add constraint care_logs_move_shape check (
    kind <> 'move' or (
      (payload ->> 'minutes') ~ '^[0-9]+(\.[0-9]+)?$'
      and (payload ->> 'minutes')::numeric between 1 and 600
    )
  );

-- ── 2. What the targets and the movement goal depend on ──────────────────────
-- lactating: use the published breastfeeding intakes as defaults.
-- exercise_cleared_on: ACOG — after a cesarean, ask the ob-gyn when exercise is
--   safe; the weekly goal appears once she marks the date she was cleared.
-- conditions: shows condition-specific guidance (RA: the 2022 ACR guideline).
alter table public.care_profiles
  add column if not exists lactating boolean not null default false,
  add column if not exists exercise_cleared_on date,
  add column if not exists conditions text[] not null default '{}'::text[];

alter table public.care_profiles
  add constraint care_profiles_conditions_known check (conditions <@ array['rheumatoid_arthritis']::text[]);

-- ── 3. The brief: today's food totals, her goals and movement ────────────────
do $do$
declare
  d text := pg_get_functiondef('public.fn_family_brief(uuid)'::regprocedure);
  anchor text := $a$order by c.at desc limit 1))), '[]'::jsonb)$a$;
  arm text := $n$order by c.at desc limit 1),
                'lactating', p.lactating, 'conditions', p.conditions,
                'exercise_cleared_on', p.exercise_cleared_on,
                'food_today', (select jsonb_build_object(
                                  'entries', count(*),
                                  'estimated', count(*) filter (where f.payload ->> 'estimated' = 'true'),
                                  'foods', coalesce(jsonb_agg(jsonb_build_object(
                                              'at', f.at, 'meal', f.payload -> 'meal', 'name', f.payload ->> 'name')
                                              order by f.at), '[]'::jsonb),
                                  'totals', (select coalesce(jsonb_object_agg(t.k, t.s), '{}'::jsonb)
                                               from (select n.key as k, round(sum(n.value::numeric), 1) as s
                                                       from public.care_logs f2,
                                                            jsonb_each_text(f2.payload -> 'nutrients') n
                                                      where f2.person_user_id = p.person_user_id and f2.kind = 'food'
                                                        and (f2.at at time zone v_tz)::date = v_today
                                                        and n.value ~ '^[0-9]+(\.[0-9]+)?$'
                                                      group by n.key) t))
                                from public.care_logs f
                               where f.person_user_id = p.person_user_id and f.kind = 'food'
                                 and (f.at at time zone v_tz)::date = v_today),
                'food_goals', (select jsonb_build_object('kcal', g.daily_kcal_target,
                                         'overrides', g.micronutrient_targets, 'since', g.start_date)
                                 from public.person_nutrition_targets g
                                where g.user_id = p.person_user_id and g.start_date <= v_today
                                order by g.start_date desc, g.created_at desc limit 1),
                'move_minutes_today', (select coalesce(sum((m.payload ->> 'minutes')::numeric), 0)
                                         from public.care_logs m
                                        where m.person_user_id = p.person_user_id and m.kind = 'move'
                                          and (m.at at time zone v_tz)::date = v_today),
                'move_minutes_7d', (select coalesce(sum((m.payload ->> 'minutes')::numeric), 0)
                                      from public.care_logs m
                                     where m.person_user_id = p.person_user_id and m.kind = 'move'
                                       and m.at > now() - interval '7 days'))), '[]'::jsonb)$n$;
begin
  if position('''food_today''' in d) > 0 then
    return; -- already applied
  end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'fn_family_brief body did not match; not changed';
  end if;
  execute replace(d, anchor, arm);
end
$do$;
