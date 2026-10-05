import { templateFor, type EventKind, type TemplateItem } from "./templates";

export const EVENT_KINDS: Array<{ value: EventKind; label: string }> = [
  { value: "medical", label: "Doctor" },
  { value: "school", label: "School" },
  { value: "activity", label: "Activity" },
  { value: "family", label: "Family" },
  { value: "other", label: "Other" },
];

/** Whole days from a birth date (YYYY-MM-DD) to a moment, by local calendar date. */
export function ageDaysOn(birthDate: string | null | undefined, at: Date): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const born = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  const d = Math.round((day - born) / 86_400_000);
  return d >= 0 ? d : null;
}

/**
 * "2026-10-07" + "14:40" → the instant, read as the phone's local time. A date
 * with no time is noon, so it lands on the same calendar day in any US zone.
 */
export function startsAtFrom(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "12:00";
  const d = new Date(`${date}T${t}:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * "Wed, Oct 7 · 2:40 pm", in the family's time zone. The zone is passed rather
 * than taken from the machine: these render on the server (UTC) as well as the
 * phone, and the two must print the same time.
 */
export function formatWhen(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }).toLowerCase();
  return `${day} · ${time}`;
}

/** Calendar date "YYYY-MM-DD" of an instant in a zone. */
function ymd(d: Date, timeZone?: string): number {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

/** "in 2 days", "tomorrow", "today", "3 days ago" — by calendar day in the zone. */
export function relativeDay(iso: string, now: Date = new Date(), timeZone?: string): string {
  const n = Math.round((ymd(new Date(iso), timeZone) - ymd(now, timeZone)) / 86_400_000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export type ItemInsert = {
  event_id: string;
  family_id: string;
  kind: TemplateItem["kind"];
  body: string;
  detail: string | null;
  source_title: string;
  source_url: string;
  template_key: string;
  position: number;
};

/** The checklist rows a new event starts with; empty when no template fits. */
export function starterItems(
  kind: EventKind,
  kidBirthDate: string | null | undefined,
  startsAt: string,
  ids: { eventId: string; familyId: string }
): { name: string | null; rows: ItemInsert[] } {
  const t = templateFor(kind, ageDaysOn(kidBirthDate, new Date(startsAt)));
  if (!t) return { name: null, rows: [] };
  return {
    name: t.name,
    rows: t.items.map((it, i) => ({
      event_id: ids.eventId,
      family_id: ids.familyId,
      kind: it.kind,
      body: it.body,
      detail: it.detail ?? null,
      source_title: it.source.title,
      source_url: it.source.url,
      template_key: it.key,
      position: i,
    })),
  };
}
