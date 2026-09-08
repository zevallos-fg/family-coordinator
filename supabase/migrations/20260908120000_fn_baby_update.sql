-- fn_baby_update — correct a baby event after the fact.
--
-- The lane could log and delete but never edit, so a feed started at the wrong
-- time could only be removed and re-entered. This is the missing verb.
--
-- SECURITY INVOKER, deliberately. baby_events already carries family-scoped
-- UPDATE and DELETE policies, so RLS is the right thing to decide this and a
-- SECURITY DEFINER function would be a second, weaker copy of that decision
-- living in code. Invoker means a caller who cannot see the row cannot edit it,
-- for exactly the same reason they cannot read it.
--
-- search_path is pinned because a SECURITY INVOKER function is still resolved
-- against the caller's path: without this, `baby_events` means whatever the
-- caller's first schema says it means.
--
-- NULL means "leave it alone", not "set it to null". That is what makes the
-- running-timer case work: pass only p_started_at and an in-progress event has
-- its start corrected while ended_at stays null and the timer keeps running.
-- Stopping a timer is fn_baby_toggle's job and stays there; this function has no
-- way to express "clear ended_at", which is the one edit nobody asked for.
--
-- p_note is the exception to that rule and says so out loud: NULL still means
-- leave alone, and an EMPTY STRING clears it. A note has to be erasable —
-- "spat up" typed onto the wrong feed has to come off it — and an empty note and
-- no note read identically, so collapsing '' to NULL loses nothing.

create or replace function public.fn_baby_update(
  p_id uuid,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_payload jsonb default null,
  p_note text default null
)
returns public.baby_events
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.baby_events;
begin
  update public.baby_events
     set started_at = coalesce(p_started_at, started_at),
         ended_at   = coalesce(p_ended_at, ended_at),
         -- Replace rather than merge. The client sends the whole payload it is
         -- showing, so a merge would make it impossible to clear a chip — and
         -- clearing a wrong chip has to be as cheap as setting it.
         payload    = coalesce(p_payload, payload),
         note       = case
                        when p_note is null then note
                        when p_note = '' then null
                        else p_note
                      end
   where id = p_id
  returning * into v_row;

  -- No row means RLS refused it or it does not exist, and the caller must not be
  -- told which. Returning null quietly would let a failed edit look like a
  -- successful one to anything that does not check.
  if v_row.id is null then
    raise exception 'baby event not found' using errcode = '42501';
  end if;

  -- No check that ended_at follows started_at: the table already carries
  -- `baby_events_interval_sane`, which fires on the UPDATE above and raises
  -- 23514 before this line is ever reached. Repeating it here would be a second
  -- copy of the rule that can drift from the real one, and the dry run proved
  -- the constraint does the work.
  return v_row;
end;
$$;

comment on function public.fn_baby_update(uuid, timestamptz, timestamptz, jsonb, text) is
  'Correct a baby event. NULL arguments mean leave unchanged, so a running timer can have its start fixed without being stopped; an empty p_note clears the note. SECURITY INVOKER: RLS decides.';

grant execute on function public.fn_baby_update(uuid, timestamptz, timestamptz, jsonb, text) to authenticated;
