-- Settling: the minutes between starting to put her down and her falling
-- asleep, as its own baby_events type. A 'settle' row is open while she's
-- being settled and is closed with outcome 'asleep' (pointing at the sleep it
-- became) or 'stopped'. Every sleep total keeps reading 'sleep' rows only, so
-- settling never counts as sleep. See lib/baby/settle.ts.
alter table public.baby_events
  drop constraint if exists baby_events_event_type_check,
  add constraint baby_events_event_type_check check (event_type in (
    'sleep', 'feed', 'diaper', 'pump', 'growth', 'medicine', 'note', 'contraction', 'settle'
  ));
