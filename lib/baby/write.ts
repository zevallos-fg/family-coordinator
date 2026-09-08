import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { FeedPayload } from "./nursing";

/**
 * The three ways a baby event gets written, in one place.
 *
 * Which RPC applies is a property of the event type, not of the screen, and
 * getting it wrong is quiet: `fn_baby_toggle` finds the open row of a type and
 * closes it, so pointing it at a diaper would "stop" one logged an hour ago,
 * while `fn_baby_log` never sets ended_at, so using it for a sleep would leave a
 * timer that can never be stopped.
 */

export type WriteResult =
  | { ok: true; id: string | null; state?: "started" | "stopped" | string }
  | { ok: false; message: string };

const FAILED = "That didn't save. Tap again?";

/** A point event: diaper, growth. Logged and finished in the same instant. */
export async function logPoint(opts: {
  familyId: string;
  type: string;
  kidId: string | null;
  payload?: Record<string, Json>;
  at?: string | null;
  note?: string | null;
}): Promise<WriteResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("fn_baby_log", {
    p_family_id: opts.familyId,
    p_event_type: opts.type,
    // The generated RPC types take undefined, not null, for an absent kid.
    p_kid_id: opts.kidId ?? undefined,
    ...(opts.payload ? { p_payload: opts.payload as never } : {}),
    ...(opts.at ? { p_at: opts.at } : {}),
    ...(opts.note ? { p_note: opts.note } : {}),
  });
  if (error) return { ok: false, message: FAILED };
  return { ok: true, id: typeof data === "string" ? data : null };
}

/** A timer: feed, sleep, pump, contraction. Starts if stopped, stops if running. */
export async function toggleTimer(opts: {
  familyId: string;
  type: string;
  kidId?: string | null;
  payload?: Record<string, Json>;
  at?: string | null;
}): Promise<WriteResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("fn_baby_toggle", {
    p_family_id: opts.familyId,
    p_event_type: opts.type,
    // Contractions pass no kid at all: baby_events allows a null kid_id only for
    // that type, which is what lets the timer work before the baby exists.
    ...(opts.kidId ? { p_kid_id: opts.kidId } : {}),
    ...(opts.payload ? { p_payload: opts.payload as never } : {}),
    ...(opts.at ? { p_at: opts.at } : {}),
  });
  if (error) return { ok: false, message: FAILED };
  // fn_baby_toggle returns TABLE(id, event_type, started_at, ended_at, state),
  // so PostgREST hands back an array of rows rather than a scalar. `state` says
  // which way it went, which is the only way to know whether a tap started or
  // stopped something without re-reading the row.
  const row = Array.isArray(data) ? (data[0] as { id?: string; state?: string } | undefined) : null;
  return { ok: true, id: row?.id ?? null, state: row?.state };
}

/**
 * Something that already finished — the manual-entry path.
 *
 * Two steps, because no RPC takes both ends: create the row at its real start,
 * then close it. The window between them is one round trip during which the row
 * looks like a running timer, which is why the failure is reported rather than
 * swallowed — a half-written entry that claims to be running is worse than none,
 * and the person needs to know to fix it.
 */
export async function logCompleted(opts: {
  familyId: string;
  type: string;
  kidId: string | null;
  startIso: string;
  endIso: string;
  payload?: Record<string, Json>;
  note?: string | null;
}): Promise<WriteResult> {
  const created = await logPoint({
    familyId: opts.familyId,
    type: opts.type,
    kidId: opts.kidId,
    payload: opts.payload,
    at: opts.startIso,
    note: opts.note,
  });
  if (!created.ok) return created;
  if (!created.id) {
    return { ok: false, message: "Saved the start but couldn't read the row back to close it." };
  }

  // Closed through the same correction path everything else uses, so the table
  // is never written to directly from a browser.
  const closed = await updateEvent({ id: created.id, endedAt: opts.endIso });
  if (!closed.ok) {
    return {
      ok: false,
      message: "Saved the start, but couldn't set the end time. Fix it in today's list.",
    };
  }
  return { ok: true, id: created.id };
}

/**
 * A correction to an event that already exists.
 *
 * Every edit in the lane goes through here, and here goes through
 * `fn_baby_update` rather than a table UPDATE: the function is SECURITY INVOKER
 * with a pinned search_path, so RLS decides who may fix what, exactly as it
 * decides who may read it.
 *
 * Omitting a field means LEAVE IT ALONE — which is what lets a running timer
 * have its start corrected without being stopped. A note is the one field that
 * can also be erased, by passing an empty string.
 */
export async function updateEvent(opts: {
  id: string;
  startedAt?: string;
  endedAt?: string;
  // FeedPayload is spelled out rather than widened away: it is a real shape with
  // ordered segments, and losing it here would make a typo in `segments` a
  // runtime discovery. Everything else the lane stores is loose by design.
  payload?: Record<string, Json> | FeedPayload;
  note?: string;
}): Promise<WriteResult> {
  const supabase = createClient();
  // Cast because lib/supabase/database.types.ts is generated from the APPLIED
  // schema, and 20260908120000_fn_baby_update.sql has not been applied yet.
  // Remove it the moment types are regenerated after that lands — a permanent
  // cast here would hide a genuinely missing function behind a passing compile.
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ error: { message: string } | null }>;

  const { error } = await rpc("fn_baby_update", {
    p_id: opts.id,
    ...(opts.startedAt ? { p_started_at: opts.startedAt } : {}),
    ...(opts.endedAt ? { p_ended_at: opts.endedAt } : {}),
    ...(opts.payload ? { p_payload: opts.payload } : {}),
    // Compared against undefined, not truthiness: "" is the value that clears it.
    ...(opts.note !== undefined ? { p_note: opts.note } : {}),
  });

  if (error) {
    // 23514 is baby_events_interval_sane — an end before a start.
    return {
      ok: false,
      message: error.message.includes("interval_sane")
        ? "That would end before it starts."
        : "Couldn't save that change.",
    };
  }
  return { ok: true, id: opts.id };
}
