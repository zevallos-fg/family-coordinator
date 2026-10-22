/**
 * Settling: the minutes between "she's tired, let's try" and "she's asleep",
 * and what got her there. Built from Yenny's own questions (2026-10-22):
 * which naps are harder, how long it takes to put her down, what the awake
 * window was, and what she used — so patterns show before habits are set.
 *
 * Shape, kept close to Leo's Sleep Wise sheet ("time in crib → time asleep →
 * time awake", awake time counted to the start of settling):
 *
 *   settle row   event_type 'settle'. Open while she's trying. `tried` keeps
 *                every method in the order tried, with the minute. Closed with
 *                outcome 'asleep' (and the sleep's id) or 'stopped'.
 *   sleep row    starts when she fell asleep, so every sleep total stays
 *                "asleep" time. Its payload carries the summary flat, so the
 *                existing chips can edit it: settle_started_at, tried, worked,
 *                mood.
 *
 * Pure: shared by the app and the Claude connector. Times are interpreted in
 * the caller's zone (the app runs in the family's; the connector passes it).
 */

import { implausible } from "./plausible";

export const SOOTHE_METHODS = [
  { value: "breastfeed", label: "Breastfeed" },
  { value: "shh", label: "Shh" },
  { value: "rock", label: "Rock" },
  { value: "pat", label: "Pat" },
  { value: "walk", label: "Walk" },
  { value: "wrap", label: "Wrap" },
  { value: "other", label: "Other" },
] as const;
export type Method = (typeof SOOTHE_METHODS)[number]["value"];
/** "Worked" can also be: nothing — she fell asleep on her own. */
export const ON_HER_OWN = "own";
export const METHOD_VALUES: string[] = SOOTHE_METHODS.map((m) => m.value);
export const WORKED_VALUES: string[] = [...METHOD_VALUES, ON_HER_OWN];
export const methodLabel = (v: string | null | undefined) =>
  v === ON_HER_OWN ? "On their own" : (SOOTHE_METHODS.find((m) => m.value === v)?.label ?? v ?? "");

export const MOODS = [
  { value: "calm", label: "Calm" },
  { value: "fussy", label: "Fussy" },
  { value: "crying", label: "Crying" },
] as const;
export type Mood = (typeof MOODS)[number]["value"];
export const MOOD_VALUES: string[] = MOODS.map((m) => m.value);
export const moodLabel = (v: string | null | undefined) => MOODS.find((m) => m.value === v)?.label ?? "";

export class SettleError extends Error {}

export type Try = { method: string; at: string };
export type SettlePayload = {
  tried: Try[];
  mood?: string | null;
  worked?: string | null;
  outcome?: "asleep" | "stopped";
  sleep_id?: string;
};

/** Tap a method: add it (with the time), or take it back off if tapped again. */
export function toggleTry(tried: Try[], method: string, atIso: string): Try[] {
  if (!METHOD_VALUES.includes(method)) throw new SettleError(`unknown method "${method}"`);
  return tried.some((t) => t.method === method) ? tried.filter((t) => t.method !== method) : [...tried, { method, at: atIso }];
}

/**
 * What worked, unless she says otherwise: the only thing tried, or the last
 * thing tried, or "on her own" when nothing was.
 */
export function defaultWorked(tried: Try[]): string {
  return tried.length ? tried[tried.length - 1].method : ON_HER_OWN;
}

/** The flat summary a sleep row carries. Validated: used by the app and the connector. */
export function sleepSettleFields(input: {
  settleStartedAt?: string | null;
  asleepAt: string;
  tried?: unknown;
  worked?: unknown;
  mood?: unknown;
}): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (input.settleStartedAt) {
    const s = Date.parse(input.settleStartedAt);
    const a = Date.parse(input.asleepAt);
    if (!Number.isFinite(s)) throw new SettleError("settle start can't be read");
    if (s > a) throw new SettleError("settling has to start before she fell asleep");
    if (a - s > 4 * 3_600_000) throw new SettleError("settling longer than 4 hours — check the times");
    out.settle_started_at = new Date(s).toISOString();
  }
  if (input.tried !== undefined && input.tried !== null) {
    if (!Array.isArray(input.tried)) throw new SettleError("tried must be a list of methods");
    const tried = input.tried.map(String);
    for (const t of tried) if (!METHOD_VALUES.includes(t)) throw new SettleError(`tried: unknown method "${t}" (use ${METHOD_VALUES.join(", ")})`);
    if (tried.length) out.tried = [...new Set(tried)];
  }
  if (input.worked !== undefined && input.worked !== null && input.worked !== "") {
    const w = String(input.worked);
    if (!WORKED_VALUES.includes(w)) throw new SettleError(`worked: unknown "${w}" (use ${WORKED_VALUES.join(", ")})`);
    out.worked = w;
  }
  if (input.mood !== undefined && input.mood !== null && input.mood !== "") {
    const m = String(input.mood);
    if (!MOOD_VALUES.includes(m)) throw new SettleError(`mood must be one of ${MOOD_VALUES.join(", ")}`);
    out.mood = m;
  }
  return out;
}

// ── Patterns ─────────────────────────────────────────────────────────────────

/** Sleeps that start between these local hours are naps, numbered in order. */
export const DAY_STARTS = 7;
export const DAY_ENDS = 19;

type Ev = { id: string; event_type: string; started_at: string; ended_at: string | null; payload: unknown; kid_id?: string | null };

export type SleepRow = {
  id: string;
  /** Local midnight of the day the sleep started (in the runtime's zone). */
  day: number;
  /** YYYY-MM-DD of the day the sleep started, in the zone asked for. */
  date: string;
  /** "Nap 1", "Nap 2", … or "Night". */
  label: string;
  napIndex: number | null;
  asleepAt: number;
  wokeAt: number | null;
  settleStart: number | null;
  settleMin: number | null;
  /** From the last wake to the start of settling (or to asleep, if no settling). */
  awakeBeforeMin: number | null;
  durationMin: number | null;
  tried: string[];
  worked: string | null;
  mood: string | null;
  location: string | null;
};

export type FailedSettle = { id: string; at: number; minutes: number | null; tried: string[]; mood: string | null };

const MIN = 60_000;

/** Local date and hour of an instant, in `timeZone` or the runtime's own zone. */
function localParts(ms: number, timeZone?: string): { date: string; hour: number } {
  if (!timeZone) {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() + d.getMinutes() / 60 };
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) + Number(p.minute) / 60 };
}
const startOfLocalDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Every finished or running sleep as a row, oldest first, with its nap number,
 * awake window and settling time; plus settling attempts that were stopped
 * without sleep. Sleeps longer than any real one are left out (plausible.ts).
 */
export function sleepRows(events: Ev[], nowMs: number, timeZone?: string): { rows: SleepRow[]; failed: FailedSettle[] } {
  const bad = new Set(implausible(events, nowMs).map((e) => e.id));
  const sleeps = events
    .filter((e) => e.event_type === "sleep" && !bad.has(e.id))
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const rows: SleepRow[] = [];
  const napCount = new Map<string, number>();
  let lastWake: number | null = null;
  for (const e of sleeps) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const asleepAt = Date.parse(e.started_at);
    const wokeAt = e.ended_at ? Date.parse(e.ended_at) : null;
    const settleStart = typeof p.settle_started_at === "string" && Number.isFinite(Date.parse(p.settle_started_at)) ? Date.parse(p.settle_started_at) : null;
    const day = startOfLocalDay(asleepAt);
    const { date, hour } = localParts(asleepAt, timeZone);
    let napIndex: number | null = null;
    if (hour >= DAY_STARTS && hour < DAY_ENDS) {
      napIndex = (napCount.get(date) ?? 0) + 1;
      napCount.set(date, napIndex);
    }
    const awakeFrom = settleStart ?? asleepAt;
    // A gap of more than 12 hours means sleeps weren't logged, not a 12-hour awake window.
    const awakeBeforeMin = lastWake !== null && awakeFrom > lastWake && awakeFrom - lastWake <= 12 * 3_600_000 ? Math.round((awakeFrom - lastWake) / MIN) : null;
    rows.push({
      id: e.id,
      day,
      date,
      label: napIndex ? `Nap ${napIndex}` : "Night",
      napIndex,
      asleepAt,
      wokeAt,
      settleStart,
      settleMin: settleStart !== null ? Math.round((asleepAt - settleStart) / MIN) : null,
      awakeBeforeMin,
      durationMin: wokeAt !== null ? Math.round((wokeAt - asleepAt) / MIN) : null,
      tried: Array.isArray(p.tried) ? (p.tried as unknown[]).map(String) : [],
      worked: typeof p.worked === "string" ? p.worked : null,
      mood: typeof p.mood === "string" ? p.mood : null,
      location: typeof p.location === "string" ? p.location : null,
    });
    if (wokeAt !== null && (lastWake === null || wokeAt > lastWake)) lastWake = wokeAt;
  }
  const failed: FailedSettle[] = events
    .filter((e) => e.event_type === "settle" && ((e.payload ?? {}) as SettlePayload).outcome === "stopped")
    .map((e) => {
      const p = (e.payload ?? {}) as SettlePayload;
      const at = Date.parse(e.started_at);
      return {
        id: e.id,
        at,
        minutes: e.ended_at ? Math.round((Date.parse(e.ended_at) - at) / MIN) : null,
        tried: (p.tried ?? []).map((t) => t.method),
        mood: p.mood ?? null,
      };
    })
    .sort((a, b) => a.at - b.at);
  return { rows, failed };
}

export function median(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

export type NapSummary = {
  label: string;
  sleeps: number;
  /** Sleeps with settling logged; settle medians only count these. */
  settled: number;
  awakeMed: number | null;
  settleMed: number | null;
  durationMed: number | null;
  /** Of sleeps with a mood logged. */
  moods: Record<string, number>;
};

/** Nap 1, Nap 2, Nap 3, Nap 4+ and Night side by side. */
export function byNap(rows: SleepRow[]): NapSummary[] {
  const key = (r: SleepRow) => (r.napIndex === null ? "Night" : r.napIndex >= 4 ? "Nap 4+" : `Nap ${r.napIndex}`);
  const order = ["Nap 1", "Nap 2", "Nap 3", "Nap 4+", "Night"];
  return order
    .map((label) => {
      const rs = rows.filter((r) => key(r) === label);
      const moods: Record<string, number> = {};
      for (const r of rs) if (r.mood) moods[r.mood] = (moods[r.mood] ?? 0) + 1;
      return {
        label,
        sleeps: rs.length,
        settled: rs.filter((r) => r.settleMin !== null).length,
        awakeMed: median(rs.map((r) => r.awakeBeforeMin)),
        settleMed: median(rs.map((r) => r.settleMin)),
        durationMed: median(rs.map((r) => r.durationMin)),
        moods,
      };
    })
    .filter((s) => s.sleeps > 0);
}

export type MethodSummary = {
  method: string;
  /** Sleeps where this was what worked. */
  worked: number;
  /** Times it was tried at all, including attempts stopped without sleep. */
  tried: number;
  /** Median minutes to settle when it was what worked. */
  settleMedWhenWorked: number | null;
};

export function byMethod(rows: SleepRow[], failed: FailedSettle[]): MethodSummary[] {
  return WORKED_VALUES.map((method) => {
    const workedRows = rows.filter((r) => r.worked === method);
    const tried =
      method === ON_HER_OWN
        ? workedRows.length
        : rows.filter((r) => r.tried.includes(method) || r.worked === method).length + failed.filter((f) => f.tried.includes(method)).length;
    return { method, worked: workedRows.length, tried, settleMedWhenWorked: median(workedRows.map((r) => r.settleMin)) };
  }).filter((m) => m.tried > 0 || m.worked > 0);
}

export function fmtMin(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
