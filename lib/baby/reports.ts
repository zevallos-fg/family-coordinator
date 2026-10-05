/**
 * Reports: the baby log as pictures — a day as a timeline, a week as seven
 * timelines side by side, and trends as bars per day, week or month.
 *
 * All local-calendar arithmetic goes through Date's own fields (setDate, local
 * hours), never "+ 86 400 000", so a daylight-saving change can't shift a day.
 * Counts only; nothing here compares a child against a range.
 */

import { segmentsOf, type FeedPayload } from "./nursing";
import { isBottle } from "./bottle";

export type Lane = "sleep" | "feed" | "diaper";

export type ReportEvent = {
  id: string;
  event_type: string;
  started_at: string;
  ended_at: string | null;
  payload: unknown;
};

/** Validated against the card surface (#1C2540) with the dataviz validator. */
export const REPORT_COLORS = {
  sleep: "#3E9BE6",
  nap: "#8CC4F2",
  feed: "#D67548",
  // Diapers: one lavender hue in three steps (validated as an ordinal ramp).
  wet: "#C3B3F6",
  mixed: "#A58DEE",
  dirty: "#8566E3",
} as const;

/** Nights for the night/nap split: 7pm–7am, said on the chart's legend. */
export const NIGHT_STARTS = 19;
export const NIGHT_ENDS = 7;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function atHour(dayStart: number, h: number): number {
  const d = new Date(dayStart);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
}

function laneOf(type: string): Lane | null {
  return type === "sleep" || type === "feed" || type === "diaper" ? type : null;
}

function endMs(e: ReportEvent, nowMs: number): number {
  return e.ended_at ? Date.parse(e.ended_at) : nowMs;
}

export type Mark = {
  id: string;
  lane: Lane;
  /** Minutes from the day's midnight; may be negative-clipped to 0. */
  start: number;
  /** Null for a point (a diaper). */
  end: number | null;
  /** True when the span continues past either edge of the day. */
  clippedStart: boolean;
  clippedEnd: boolean;
  event: ReportEvent;
};

/** What to draw for one local day: spans clipped to the day, diapers as points. */
export function dayMarks(events: ReportEvent[], dayStart: number, nowMs: number): Mark[] {
  const dayEnd = addDays(dayStart, 1);
  const dayLen = dayEnd - dayStart;
  const out: Mark[] = [];
  for (const e of events) {
    const lane = laneOf(e.event_type);
    if (!lane) continue;
    const s = Date.parse(e.started_at);
    if (!Number.isFinite(s)) continue;
    if (lane === "diaper") {
      if (s >= dayStart && s < dayEnd)
        out.push({ id: e.id, lane, start: (s - dayStart) / 60_000, end: null, clippedStart: false, clippedEnd: false, event: e });
      continue;
    }
    // A bottle is logged as an instant; draw it as a short mark, not nothing.
    let en = endMs(e, nowMs);
    if (en <= s) en = s + 5 * 60_000;
    if (en <= dayStart || s >= dayEnd) continue;
    out.push({
      id: e.id,
      lane,
      start: (Math.max(s, dayStart) - dayStart) / 60_000,
      end: (Math.min(en, dayEnd) - dayStart) / 60_000,
      clippedStart: s < dayStart,
      clippedEnd: en > dayEnd,
      event: e,
    });
  }
  // Keep a 24h day 1440 minutes wide even on a 23- or 25-hour DST day.
  const scale = 1440 / (dayLen / 60_000);
  return out.map((m) => ({ ...m, start: m.start * scale, end: m.end === null ? null : m.end * scale }));
}

/** Total length of possibly overlapping spans; overlaps count once. */
function union(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function overlap(spans: Array<[number, number]>, from: number, to: number): number {
  let t = 0;
  for (const [a, b] of spans) t += Math.max(0, Math.min(b, to) - Math.max(a, from));
  return t;
}

export type DayStats = {
  dayStart: number;
  /** Any entry at all that day — used so averages skip days nothing was logged. */
  logged: boolean;
  nightMs: number;
  napMs: number;
  feeds: number;
  nursingMs: number;
  bottles: number;
  wet: number;
  dirty: number;
  diapers: number;
  /** Exclusive kinds, which stack: pee only, mixed, poo only. Dry is counted apart. */
  peeOnly: number;
  mixed: number;
  pooOnly: number;
  dry: number;
};

/** Per local day, from `fromDay` for `days` days. Sleep is split at midnight. */
export function dailyStats(events: ReportEvent[], fromDay: number, days: number, nowMs: number): DayStats[] {
  const sleeps = union(
    events.filter((e) => e.event_type === "sleep").map((e) => [Date.parse(e.started_at), Math.min(endMs(e, nowMs), nowMs)] as [number, number])
  );
  const out: DayStats[] = [];
  let day = fromDay;
  for (let i = 0; i < days; i++) {
    const next = addDays(day, 1);
    const morning = atHour(day, NIGHT_ENDS);
    const evening = atHour(day, NIGHT_STARTS);
    const total = overlap(sleeps, day, next);
    const nap = overlap(sleeps, morning, evening);
    const st: DayStats = {
      dayStart: day,
      logged: total > 0,
      nightMs: total - nap,
      napMs: nap,
      feeds: 0,
      nursingMs: 0,
      bottles: 0,
      wet: 0,
      dirty: 0,
      diapers: 0,
      peeOnly: 0,
      mixed: 0,
      pooOnly: 0,
      dry: 0,
    };
    for (const e of events) {
      const s = Date.parse(e.started_at);
      if (!(s >= day && s < next)) continue;
      if (e.event_type === "feed") {
        st.logged = true;
        st.feeds++;
        const p = e.payload as FeedPayload | null;
        if (isBottle(p)) st.bottles++;
        else st.nursingMs += segmentsOf(p).reduce((n, seg) => n + seg.seconds * 1000, 0);
      } else if (e.event_type === "diaper") {
        st.logged = true;
        st.diapers++;
        const c = (e.payload as { contents?: string } | null)?.contents;
        if (c === "pee" || c === "both") st.wet++;
        if (c === "poo" || c === "both") st.dirty++;
        if (c === "pee") st.peeOnly++;
        else if (c === "both") st.mixed++;
        else if (c === "poo") st.pooOnly++;
        else if (c === "dry") st.dry++;
      }
    }
    out.push(st);
    day = next;
  }
  return out;
}

export type Grain = "day" | "week" | "month";
export const RANGES = [
  { key: "7D", days: 7, grain: "day" as Grain },
  { key: "14D", days: 14, grain: "day" as Grain },
  { key: "30D", days: 30, grain: "day" as Grain },
  { key: "90D", days: 91, grain: "week" as Grain },
  { key: "1Y", days: 365, grain: "month" as Grain },
];

export type Bucket = {
  start: number;
  /** Days in the bucket that had any entry; averages divide by this. */
  loggedDays: number;
  nightMs: number;
  napMs: number;
  feeds: number;
  nursingMs: number;
  bottles: number;
  wet: number;
  dirty: number;
  peeOnly: number;
  mixed: number;
  pooOnly: number;
  dry: number;
};

/**
 * Days as they are, or weeks/months as the average logged day in them. A day
 * with nothing logged (before she was born, a day the app wasn't used) is left
 * out of the average rather than counted as zero sleep and zero feeds.
 */
export function buckets(stats: DayStats[], grain: Grain): Bucket[] {
  const keyOf = (ms: number) => {
    if (grain === "day") return ms;
    const d = new Date(ms);
    if (grain === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    // Weeks start Monday.
    const back = (d.getDay() + 6) % 7;
    return addDays(startOfDay(ms), -back);
  };
  const map = new Map<number, Bucket>();
  for (const s of stats) {
    const k = keyOf(s.dayStart);
    const b = map.get(k) ?? { start: k, loggedDays: 0, nightMs: 0, napMs: 0, feeds: 0, nursingMs: 0, bottles: 0, wet: 0, dirty: 0, peeOnly: 0, mixed: 0, pooOnly: 0, dry: 0 };
    if (s.logged) {
      b.loggedDays++;
      b.nightMs += s.nightMs;
      b.napMs += s.napMs;
      b.feeds += s.feeds;
      b.nursingMs += s.nursingMs;
      b.bottles += s.bottles;
      b.wet += s.wet;
      b.dirty += s.dirty;
      b.peeOnly += s.peeOnly;
      b.mixed += s.mixed;
      b.pooOnly += s.pooOnly;
      b.dry += s.dry;
    }
    map.set(k, b);
  }
  return [...map.values()]
    .sort((a, b) => a.start - b.start)
    .map((b) => {
      if (grain === "day" || b.loggedDays === 0) return b;
      const n = b.loggedDays;
      return { ...b, nightMs: b.nightMs / n, napMs: b.napMs / n, feeds: b.feeds / n, nursingMs: b.nursingMs / n, bottles: b.bottles / n, wet: b.wet / n, dirty: b.dirty / n, peeOnly: b.peeOnly / n, mixed: b.mixed / n, pooOnly: b.pooOnly / n, dry: b.dry / n };
    });
}

/** "11h 20m" from milliseconds. */
export function hm(ms: number): string {
  const m = Math.round(ms / 60_000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** "S3" (or "10/3" when dense), "Oct 6–12", "Oct" — the tick label for a bucket. */
export function bucketLabel(start: number, grain: Grain, short = true, dense = false): string {
  const d = new Date(start);
  if (grain === "month") return d.toLocaleDateString("en-US", { month: "short" });
  if (grain === "week") {
    const end = new Date(addDays(start, 6));
    return short
      ? d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
      : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  if (short && dense) return `${d.getMonth() + 1}/${d.getDate()}`;
  return short ? `${d.toLocaleDateString("en-US", { weekday: "narrow" })}${d.getDate()}` : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
