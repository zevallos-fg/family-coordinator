/**
 * What a single timed entry can plausibly be.
 *
 * On 2026-10-18 a sleep started at 3:19 am was stored as starting three days
 * earlier: the START TIME control was showing the date the page was opened,
 * and picking a time kept that stale date. One 72-hour row made every day it
 * crossed read "24h 00m" of sleep. No single sleep, feed or pump runs past
 * 16 hours, so anything longer is a typo to fix, not a measurement — the
 * reports leave it out of totals and say so, and the forms refuse it.
 *
 * Dependency-free: the Claude connector shares it.
 */

export const MAX_SPAN_HOURS = 16;
const MAX_MS = MAX_SPAN_HOURS * 3_600_000;
const TIMED = new Set(["sleep", "feed", "pump"]);

type Row = { event_type: string; started_at: string; ended_at: string | null };

/** Length of a timed entry; a running one counts to now. */
export function spanMs(e: Row, nowMs: number): number {
  const s = Date.parse(e.started_at);
  const end = e.ended_at ? Date.parse(e.ended_at) : nowMs;
  return Number.isFinite(s) && Number.isFinite(end) ? end - s : 0;
}

export function tooLong(ms: number): boolean {
  return ms > MAX_MS;
}

/** Sleeps (and other timed rows) longer than any real one. */
export function implausible<T extends Row>(events: T[], nowMs: number, types: string[] = ["sleep"]): T[] {
  return events.filter((e) => types.includes(e.event_type) && TIMED.has(e.event_type) && tooLong(spanMs(e, nowMs)));
}

function when(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

/**
 * Why a timer's start can't be used, or null. A start more than 16 hours ago
 * would open a timer that is already longer than any real entry; one in the
 * future is a slip of the date.
 */
export function startProblem(iso: string | null, nowMs: number, timeZone?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "That start time can't be read.";
  if (t > nowMs + 5 * 60_000) return `That start is in the future (${when(t, timeZone)}). Check the date.`;
  if (nowMs - t > MAX_MS) {
    const hours = Math.round((nowMs - t) / 3_600_000);
    return `That start is ${when(t, timeZone)}, ${hours} hours ago. Check the date — a timer can't start more than ${MAX_SPAN_HOURS} hours back. Use manual entry for an older one.`;
  }
  return null;
}

/** Why a from–to entry can't be saved, or null. */
export function spanProblem(startIso: string, endIso: string): string | null {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return "Both times are needed.";
  if (e <= s) return "The end has to be after the start.";
  if (tooLong(e - s)) {
    return `That's ${Math.round((e - s) / 3_600_000)} hours. Check the dates — one entry can't be longer than ${MAX_SPAN_HOURS} hours.`;
  }
  return null;
}

/** One line for a report banner. */
export function describeLong(e: Row, nowMs: number, timeZone?: string): string {
  const s = Date.parse(e.started_at);
  const hours = Math.round(spanMs(e, nowMs) / 3_600_000);
  return e.ended_at
    ? `${when(s, timeZone)} → ${when(Date.parse(e.ended_at), timeZone)} (${hours} h)`
    : `${when(s, timeZone)}, still running (${hours} h)`;
}
