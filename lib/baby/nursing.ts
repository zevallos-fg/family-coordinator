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
  /**
   * ISO instant this spell stopped. Stamped by stopRunning; absent on spells
   * written before it existed, which is why every reader treats it as optional.
   */
  ended?: string;
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
    segments: [...segmentsOf(payload), { side: running.side, seconds, ended: new Date(now).toISOString() }],
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

/**
 * A breast feed with timed spells — the only kind whose length is the sum of
 * its sides. Bottles, and breast feeds entered by hand with no spells, have
 * nothing to sum and keep end − start.
 */
export function isTimedNursing(payload: FeedPayload | null | undefined): boolean {
  if (!payload || payload.method === "bottle" || typeof payload.volume_ml === "number") return false;
  return segmentsOf(payload).length > 0;
}

/** Whether any spell carries its stop instant, which makes ended_at derived. */
export function hasSpellStamps(payload: FeedPayload | null | undefined): boolean {
  return segmentsOf(payload).some((s) => typeof s.ended === "string");
}

/**
 * How long an event lasted, in seconds, or null while it is still running.
 *
 * A timed breast feed is Left + Right and never end − start: the gap between
 * the two is time nobody was feeding — a burp, a nappy, a timer left running —
 * and counting it is how a 25-minute feed came to read as 57.
 */
export function eventDurationSeconds(event: {
  event_type: string;
  started_at: string;
  ended_at: string | null;
  payload: unknown;
}): number | null {
  if (!event.ended_at) return null;
  const payload = event.payload as FeedPayload | null;
  if (event.event_type === "feed" && isTimedNursing(payload)) {
    return segmentsOf(payload).reduce((n, s) => n + s.seconds, 0);
  }
  return Math.max(0, Math.round((Date.parse(event.ended_at) - Date.parse(event.started_at)) / 1000));
}

/**
 * Done. A side still going is stopped at `nowIso` first, and the session ends
 * when its last stamped spell did — not when someone got round to tapping
 * Done. A feed with no stamps (written before they existed) ends now, as it
 * always has.
 */
export function finishSession(
  payload: FeedPayload,
  nowIso: string
): { payload: FeedPayload; endedAt: string } {
  const stopped = payload.running ? stopRunning(payload, Date.parse(nowIso)) : payload;
  const stamped = segmentsOf(stopped).filter((s) => typeof s.ended === "string");
  const endedAt = stamped.length > 0 ? stamped[stamped.length - 1].ended! : nowIso;
  return { payload: { ...stopped, running: null }, endedAt };
}

/**
 * What someone types into a side's duration: "10", "10:00", "1:02:30",
 * "10m 0s". A bare number is minutes. Null for anything else, so a typo is
 * never saved as zero.
 */
export function parseSideDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;

  const units = text.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }

  const parts = text.split(":");
  if (parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 1) return n[0] * 60;
  if (n.length === 2) return n[1] < 60 ? n[0] * 60 + n[1] : null;
  return n[1] < 60 && n[2] < 60 ? n[0] * 3600 + n[1] * 60 + n[2] : null;
}

export type SideEdit =
  | { kind: "none" }
  | { kind: "refuse"; message: string }
  | { kind: "write"; payload: FeedPayload; endedAt?: string };

/**
 * Correct one side's total on a finished breast feed — "the right side ran 21
 * minutes too long because nobody stopped it".
 *
 * The change lands on the MOST RECENT spell of that side; order is kept, and a
 * spell cut to nothing is removed. A cut bigger than that spell carries on into
 * the side's earlier spells, so the side ends up at the number typed.
 *
 * If that spell is the feed's last and is stamped, its `ended` moves by the same
 * amount and the row's ended_at follows it (never before the start, never after
 * now). Anything else — an earlier spell, or a legacy one with no stamp — leaves
 * ended_at exactly where it was.
 *
 * Pure: the caller does the write, and only on kind "write".
 */
export function planSideEdit(
  row: { started_at: string; ended_at: string | null; payload: FeedPayload },
  side: NursingSide,
  input: string,
  nowMs: number = Date.now()
): SideEdit {
  const target = parseSideDuration(input);
  if (target === null) return { kind: "none" };

  const segments = segmentsOf(row.payload).map((s) => ({ ...s }));
  const delta = target - sideTotals(segments)[side];
  if (delta === 0) return { kind: "none" };

  const other: NursingSide = side === "L" ? "R" : "L";
  if (target === 0 && sideTotals(segments)[other] === 0) {
    return { kind: "refuse", message: "Use Delete to remove the feed." };
  }

  const recent = segments.map((s) => s.side).lastIndexOf(side);
  let lastShift = 0;

  if (recent === -1) {
    // A side that was never timed gets a spell of its own, unstamped: nobody
    // knows when it stopped, so it must not move the end.
    segments.push({ side, seconds: delta });
  } else if (delta > 0) {
    segments[recent].seconds += delta;
    if (recent === segments.length - 1) lastShift = delta;
  } else {
    let remaining = -delta;
    for (let i = recent; i >= 0 && remaining > 0; i--) {
      if (segments[i].side !== side) continue;
      const cut = Math.min(segments[i].seconds, remaining);
      segments[i].seconds -= cut;
      remaining -= cut;
      if (i === segments.length - 1) lastShift = -cut;
    }
  }

  let endedAt: string | undefined;
  const last = segments[segments.length - 1];
  if (lastShift !== 0 && last.ended) {
    const shifted = Math.min(
      nowMs,
      Math.max(Date.parse(row.started_at), Date.parse(last.ended) + lastShift * 1000)
    );
    endedAt = new Date(shifted).toISOString();
    last.ended = endedAt;
  }

  return {
    kind: "write",
    payload: { ...row.payload, segments: segments.filter((s) => s.seconds > 0) },
    ...(endedAt ? { endedAt } : {}),
  };
}
