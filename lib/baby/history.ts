import { formatDuration } from "./format";
import { isBottle } from "./bottle";
import { eventDurationSeconds, type FeedPayload } from "./nursing";

/**
 * The full history for one event type, grouped into days.
 *
 * Recent only ever showed the last 24 hours and ten rows, so on a busy night
 * the earlier feeds simply fell off the screen — still in the database, just
 * not shown. This is the view of everything, newest first, a day at a time.
 *
 * A day is the local calendar day the event STARTED on. A sleep from 11pm to
 * 6am belongs to the day it began, which is how people say it ("she slept
 * well last night").
 */

export interface HistoryEvent {
  id: string;
  event_type: string;
  started_at: string;
  ended_at: string | null;
  payload: unknown;
}

export interface HistoryDay<E extends HistoryEvent> {
  key: string;
  label: string;
  events: E[];
}

function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(key: string, now: Date = new Date()): string {
  const today = localDayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === today) return "Today";
  if (key === localDayKey(y)) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Newest day first, newest event first within a day. */
export function groupByDay<E extends HistoryEvent>(events: E[], now: Date = new Date()): HistoryDay<E>[] {
  const sorted = [...events].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const days: HistoryDay<E>[] = [];
  for (const e of sorted) {
    const key = localDayKey(new Date(e.started_at));
    const last = days[days.length - 1];
    if (last && last.key === key) last.events.push(e);
    else days.push({ key, label: dayLabel(key, now), events: [e] });
  }
  return days;
}

/**
 * The one line under a day's heading. Only finished events count toward time,
 * so a feed still running does not inflate the total while it ticks.
 *
 *   feed    "13 feeds · nursing 4h 12m · bottle 15 ml"
 *   sleep   "4 sleeps · 9h 30m"
 *   others  "6 diapers"
 */
export function daySummary(type: string, events: HistoryEvent[]): string {
  const n = events.length;
  const noun: Record<string, [string, string]> = {
    feed: ["feed", "feeds"],
    diaper: ["diaper", "diapers"],
    sleep: ["sleep", "sleeps"],
    pump: ["pump", "pumps"],
    growth: ["measurement", "measurements"],
  };
  const [one, many] = noun[type] ?? ["entry", "entries"];
  const parts = [`${n} ${n === 1 ? one : many}`];

  if (type === "feed") {
    let nursing = 0;
    const bottles = new Map<string, number>();
    for (const e of events) {
      const p = (e.payload ?? {}) as FeedPayload;
      if (isBottle(p)) {
        const unit = p.unit ?? "ml";
        const amount = typeof p.amount === "number" ? p.amount : (p.volume_ml ?? 0);
        bottles.set(unit, (bottles.get(unit) ?? 0) + amount);
      } else {
        nursing += eventDurationSeconds(e) ?? 0;
      }
    }
    if (nursing > 0) parts.push(`nursing ${formatDuration(nursing)}`);
    if (bottles.size > 0) {
      // Units are never added together: 7 ml and 2 oz stay "7 ml + 2 oz".
      const text = [...bottles.entries()]
        .map(([unit, total]) => `${Math.round(total * 10) / 10} ${unit}`)
        .join(" + ");
      parts.push(`bottle ${text}`);
    }
  } else if (type === "sleep" || type === "pump") {
    const seconds = events.reduce((s, e) => s + (eventDurationSeconds(e) ?? 0), 0);
    if (seconds > 0) parts.push(formatDuration(seconds));
  }
  return parts.join(" · ");
}
