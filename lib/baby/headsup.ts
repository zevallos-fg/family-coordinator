/**
 * The top of the Kids page: things that need raising, and things worth knowing
 * at this age that have no other home.
 *
 * Raised: a timer left open, a medicine due, a checkup that is due and not
 * booked. Informative: the next booked event and its prep, the next CDC
 * milestone checklist, and — in the first weeks — a few sourced facts about
 * what is typical. Nothing here reads a child's numbers; the counts live in
 * their own cards below.
 */

import { ageInDays } from "./glance";

export type Note = {
  key: string;
  tone: "raise" | "plan" | "info";
  title: string;
  detail?: string;
  href?: string;
  source?: { title: string; url: string };
};

type LaneEvent = {
  event_type: string;
  kid_id: string | null;
  started_at: string;
  ended_at: string | null;
  payload: unknown;
};
export type Checkpoint = { id: string; kind: string; label: string; age: string; source_url: string };
export type Planned = { id: string; title: string; kind: string; starts_at: string; prep_done: number; prep_total: number };
export type Med = { name: string; next_due_at: string | null };

/** Postgres interval text ("5 days", "1 mon", "1 year 3 mons") → {y, m, d}. */
export function parseAge(text: string): { y: number; m: number; d: number } {
  const n = (re: RegExp) => Number(re.exec(text)?.[1] ?? 0);
  return { y: n(/(\d+)\s*years?/), m: n(/(\d+)\s*mons?/), d: n(/(\d+)\s*days?/) };
}

/** Birth date + checkpoint age, as a local calendar date. */
export function dueDate(birthDate: string, age: string): Date {
  const [by, bm, bd] = birthDate.slice(0, 10).split("-").map(Number);
  const { y, m, d } = parseAge(age);
  return new Date(by + y, bm - 1 + m, bd + d, 12);
}

function shortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
function mins(ms: number) {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const FIRST_WEEKS: Note[] = [
  {
    key: "fact-weight",
    tone: "info",
    title: "Back to birth weight by about 2 weeks",
    detail: "Newborns lose weight in the first days and start gaining from about day 5; almost all are back to birth weight by 3 weeks.",
    source: {
      title: "First Month: Physical Appearance and Growth — AAP",
      url: "https://www.healthychildren.org/English/ages-stages/baby/Pages/First-Month-Physical-Appearance-and-Growth.aspx",
    },
  },
  {
    key: "fact-cord",
    tone: "info",
    title: "Cord stump falls off by 3 weeks",
    detail: "Keep it clean and dry with the diaper folded below it. Call right away if it actively bleeds.",
    source: {
      title: "Umbilical Cord Care — AAP",
      url: "https://www.healthychildren.org/English/ages-stages/baby/bathing-skin-care/Pages/Umbilical-Cord-Care.aspx",
    },
  },
];

export function headsUp(input: {
  kid: { id: string; name: string; birth_date: string | null } | null;
  events: LaneEvent[];
  checkpoints: Checkpoint[];
  planned: Planned[];
  meds: Med[];
  nowMs: number;
}): Note[] {
  const { kid, events, checkpoints, planned, meds, nowMs } = input;
  if (!kid) return [];
  const out: Note[] = [];
  const mine = events.filter((e) => e.kid_id === kid.id);

  // ── Raise: timers left open ────────────────────────────────────────────────
  for (const e of mine) {
    if (e.ended_at !== null) continue;
    const started = Date.parse(e.started_at);
    if (e.event_type === "feed") {
      const p = (e.payload ?? {}) as { running?: { since?: string } | null; segments?: Array<{ ended?: string }> };
      if (p.running?.since) {
        const since = Date.parse(p.running.since);
        if (nowMs - since > 60 * 60_000)
          out.push({
            key: "open-feed",
            tone: "raise",
            title: `Feed timer running ${mins(nowMs - since)}`,
            detail: "Still feeding? If not, stop it so the times stay right.",
            href: "/baby/feed",
          });
      } else {
        const last = p.segments?.at(-1)?.ended;
        const quietSince = last ? Date.parse(last) : started;
        if (nowMs - quietSince > 30 * 60_000)
          out.push({
            key: "open-feed",
            tone: "raise",
            title: `Feed from ${clock(e.started_at)} is still open`,
            detail: last ? `The last side stopped at ${clock(last)}. Finish it, or keep going.` : "Finish it, or keep going.",
            href: "/baby/feed",
          });
      }
    } else if (e.event_type === "sleep" && nowMs - started > 8 * 3600_000) {
      out.push({ key: "open-sleep", tone: "raise", title: `Sleep timer running since ${clock(e.started_at)}`, detail: "Still asleep? If not, stop it.", href: "/baby/sleep" });
    } else if (e.event_type === "pump" && nowMs - started > 60 * 60_000) {
      out.push({ key: "open-pump", tone: "raise", title: `Pump timer running since ${clock(e.started_at)}`, href: "/baby/pump" });
    }
  }

  // ── Raise: medicine due ────────────────────────────────────────────────────
  for (const m of meds) {
    if (m.next_due_at && Date.parse(m.next_due_at) <= nowMs)
      out.push({ key: `med-${m.name}`, tone: "raise", title: `${m.name} due`, detail: `Since ${clock(m.next_due_at)}`, href: "/baby/medicine" });
  }

  // ── Plan: what's booked ────────────────────────────────────────────────────
  const upcoming = planned
    .filter((p) => Date.parse(p.starts_at) > nowMs - 2 * 3600_000)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const p of upcoming.slice(0, 2)) {
    const d = new Date(p.starts_at);
    out.push({
      key: `event-${p.id}`,
      tone: "plan",
      title: p.title,
      detail: `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${clock(p.starts_at)}${
        p.prep_total ? ` · prep ${p.prep_done}/${p.prep_total}` : ""
      }`,
      href: `/plan/${p.id}`,
    });
  }

  if (kid.birth_date) {
    const days = ageInDays(kid.birth_date, new Date(nowMs)) ?? 0;
    const medicalSoon = planned.some((p) => p.kind === "medical");

    // ── Raise: a checkup that's due and not booked ───────────────────────────
    // Within three weeks either side of its date, and only when nothing medical
    // is booked for this child — a booked visit is assumed to be the one.
    const visits = checkpoints
      .filter((c) => c.kind === "well_visit")
      .map((c) => ({ c, due: dueDate(kid.birth_date!, c.age) }))
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const near = visits.find((v) => Math.abs(v.due.getTime() - nowMs) < 21 * 86_400_000);
    if (near && !medicalSoon) {
      out.push({
        key: `book-${near.c.id}`,
        tone: "raise",
        title: `Book the ${near.c.label}`,
        detail: `${near.due.getTime() < nowMs ? "Was due" : "Due"} around ${shortDate(near.due)}`,
        href: "/plan",
        source: { title: "Well-child visit schedule — AAP", url: near.c.source_url },
      });
    } else {
      const next = visits.find((v) => v.due.getTime() > nowMs + 21 * 86_400_000);
      if (next && !upcoming.length)
        out.push({ key: `next-${next.c.id}`, tone: "info", title: `Next: ${next.c.label}`, detail: `Around ${shortDate(next.due)}`, href: "/plan" });
    }

    // ── Info: the next milestone checklist ───────────────────────────────────
    const ms = checkpoints
      .filter((c) => c.kind === "milestone_checklist")
      .map((c) => ({ c, due: dueDate(kid.birth_date!, c.age) }))
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .find((v) => v.due.getTime() >= nowMs - 14 * 86_400_000);
    if (ms) {
      out.push({
        key: `ms-${ms.c.id}`,
        tone: "info",
        title: `${ms.c.label[0].toUpperCase()}${ms.c.label.slice(1)}`,
        detail: `Around ${shortDate(ms.due)} — what most children do by then, and what to raise with the doctor.`,
        source: { title: "Milestone checklists — CDC", url: ms.c.source_url },
      });
    }

    if (days <= 21) out.push(...FIRST_WEEKS);
  }

  return out;
}

/** "Day 5 · week 1", "7 weeks", "3 years, 8 months". */
export function ageLine(birthDate: string | null, nowMs: number): string | null {
  const days = ageInDays(birthDate, new Date(nowMs));
  if (days === null || !birthDate) return null;
  if (days < 28) return `Day ${days} · week ${Math.floor(days / 7) + 1}`;
  if (days < 91) return `${Math.floor(days / 7)} weeks`;
  const [y, m, d] = birthDate.split("-").map(Number);
  const now = new Date(nowMs);
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
  if (now.getDate() < d) months--;
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years, ${months % 12} months`;
}
