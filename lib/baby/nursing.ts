/**
 * Per-side nursing: one session, ordered segments, and where to start next time.
 *
 * Filled in 87.8% of 2,526 feeds in the family's own export — the most-used field
 * anywhere in three years of data. The shape below is theirs, not an invention:
 * a session is a list of {side, seconds} in the order they happened, and the
 * session's duration is their sum. Two segments is the common case; more happens.
 *
 * `running` is the part that makes a timer survive the app closing. A segment is
 * only written to `segments` when that side stops, so the side currently being
 * fed lives in `running` as {side, since} and is added up against the clock on
 * read. Combined with `ended_at IS NULL` on the row, the database holds the whole
 * state of an in-progress feed and local state holds none of it.
 */

export type NursingSide = "L" | "R";

export interface NursingSegment {
  side: NursingSide;
  seconds: number;
}

export interface RunningSide {
  side: NursingSide;
  /** ISO instant this side started. */
  since: string;
}

export interface FeedPayload {
  method?: "breast" | "bottle" | "solid";
  segments?: NursingSegment[];
  running?: RunningSide | null;
  last_side?: NursingSide;
  /** Bottles. The export stored volume in oz; we keep ml and convert on display. */
  volume_ml?: number;
  /** Bottles. "Breast Milk" in the export, but it is free text by design. */
  contents?: string;
}

export const SIDE_LABEL: Record<NursingSide, string> = { L: "Left", R: "Right" };

export function segmentsOf(payload: FeedPayload | null | undefined): NursingSegment[] {
  const raw = payload?.segments;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is NursingSegment =>
      !!s && (s.side === "L" || s.side === "R") && Number.isFinite(s.seconds) && s.seconds >= 0
  );
}

/** Seconds banked per side, not counting whatever is running right now. */
export function sideTotals(segments: NursingSegment[]): Record<NursingSide, number> {
  return segments.reduce(
    (acc, s) => ({ ...acc, [s.side]: acc[s.side] + s.seconds }),
    { L: 0, R: 0 } as Record<NursingSide, number>
  );
}

/**
 * The whole session, including the side still going.
 * `now` is passed in rather than read, so this is a pure function and testable.
 */
export function sessionSeconds(payload: FeedPayload | null | undefined, now: number): number {
  const banked = segmentsOf(payload).reduce((n, s) => n + s.seconds, 0);
  return banked + runningSeconds(payload, now);
}

export function runningSeconds(payload: FeedPayload | null | undefined, now: number): number {
  const running = payload?.running;
  if (!running) return 0;
  const since = Date.parse(running.since);
  if (!Number.isFinite(since)) return 0;
  // A clock that disagrees with the server must not produce a negative timer.
  return Math.max(0, Math.round((now - since) / 1000));
}

/** Total for one side including the running clock, for the two big numbers. */
export function displaySeconds(
  payload: FeedPayload | null | undefined,
  side: NursingSide,
  now: number
): number {
  const banked = sideTotals(segmentsOf(payload))[side];
  return payload?.running?.side === side ? banked + runningSeconds(payload, now) : banked;
}

/**
 * Stop whatever is running and bank it. Segments are appended, never merged:
 * two spells on the same side really were two spells, and the export records
 * them that way.
 */
export function stopRunning(payload: FeedPayload, now: number): FeedPayload {
  const running = payload.running;
  if (!running) return payload;
  const seconds = runningSeconds(payload, now);
  return {
    ...payload,
    segments: [...segmentsOf(payload), { side: running.side, seconds }],
    running: null,
    last_side: running.side,
  };
}

/**
 * Start a side. Stops the other one first, because a baby is not on both at once
 * — and doing it in one step means the UI has no state where both look live.
 */
export function startSide(payload: FeedPayload, side: NursingSide, nowIso: string): FeedPayload {
  const now = Date.parse(nowIso);
  const stopped = payload.running ? stopRunning(payload, now) : payload;
  return { ...stopped, method: "breast", running: { side, since: nowIso } };
}

/** Which side to suggest next: the opposite of the one that finished last. */
export function suggestedSide(lastSide: NursingSide | null | undefined): NursingSide {
  return lastSide === "L" ? "R" : "L";
}

/** The side a finished session ended on, for seeding the next one. */
export function lastSideOf(payload: FeedPayload | null | undefined): NursingSide | null {
  if (payload?.last_side === "L" || payload?.last_side === "R") return payload.last_side;
  const segments = segmentsOf(payload);
  return segments.length > 0 ? segments[segments.length - 1].side : null;
}

/** "12m 30s" — seconds only matter while the number is small. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
