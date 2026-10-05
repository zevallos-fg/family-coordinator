import { describe, expect, it } from "vitest";
import { ageLine, dueDate, headsUp, parseAge, type Checkpoint } from "./headsup";

const now = new Date(2026, 9, 5, 17, 35).getTime(); // Mon Oct 5, 5:35 pm
const iso = (h: number, m: number) => new Date(2026, 9, 5, h, m).toISOString();
const kid = { id: "k", name: "Evaluna", birth_date: "2026-09-30" };
const CPS: Checkpoint[] = [
  { id: "visit-newborn", kind: "well_visit", label: "newborn checkup (3–5 days)", age: "5 days", source_url: "https://example.org/v" },
  { id: "visit-1m", kind: "well_visit", label: "1-month checkup", age: "1 mon", source_url: "https://example.org/v" },
  { id: "milestones-2m", kind: "milestone_checklist", label: "2-month milestone checklist", age: "2 mons", source_url: "https://www.cdc.gov/act-early/milestones/index.html" },
];
const base = { kid, events: [], checkpoints: CPS, planned: [], meds: [], nowMs: now };

describe("interval ages", () => {
  it("parses postgres interval text", () => {
    expect(parseAge("1 year 3 mons")).toEqual({ y: 1, m: 3, d: 0 });
    expect(parseAge("5 days")).toEqual({ y: 0, m: 0, d: 5 });
  });
  it("adds to the birth date by calendar", () => {
    expect(dueDate("2026-09-30", "1 mon").getDate()).toBe(30);
    expect(dueDate("2023-02-09", "4 years").getFullYear()).toBe(2027);
  });
});

describe("headsUp", () => {
  it("raises a feed left open after its last side stopped", () => {
    const notes = headsUp({
      ...base,
      events: [{ event_type: "feed", kid_id: "k", started_at: iso(16, 30), ended_at: null, payload: { running: null, segments: [{ side: "L", seconds: 584, ended: iso(16, 39) }] } }],
    });
    expect(notes[0]).toMatchObject({ key: "open-feed", tone: "raise", href: "/baby/feed" });
  });
  it("does not raise a feed that is actively running and short", () => {
    const notes = headsUp({
      ...base,
      events: [{ event_type: "feed", kid_id: "k", started_at: iso(17, 20), ended_at: null, payload: { running: { side: "L", since: iso(17, 20) } } }],
    });
    expect(notes.find((n) => n.key === "open-feed")).toBeUndefined();
  });
  it("asks to book a due checkup only when nothing medical is booked", () => {
    expect(headsUp(base).find((n) => n.key === "book-visit-newborn")).toBeTruthy();
    const booked = headsUp({
      ...base,
      planned: [{ id: "e", title: "1st month checkup", kind: "medical", starts_at: new Date(2026, 9, 7, 14, 40).toISOString(), prep_done: 0, prep_total: 14 }],
    });
    expect(booked.find((n) => n.key.startsWith("book-"))).toBeUndefined();
    expect(booked.find((n) => n.key === "event-e")?.detail).toContain("prep 0/14");
  });
  it("names the next milestone checklist with its CDC source, and first-weeks facts with theirs", () => {
    const notes = headsUp(base);
    expect(notes.find((n) => n.key === "ms-milestones-2m")?.source?.url).toContain("cdc.gov");
    expect(notes.filter((n) => n.key.startsWith("fact-")).every((n) => n.source?.url.startsWith("https://"))).toBe(true);
  });
  it("raises medicine that is due", () => {
    expect(headsUp({ ...base, meds: [{ name: "Vitamin D", next_due_at: iso(17, 0) }] })[0]).toMatchObject({ tone: "raise", title: "Vitamin D due" });
  });
  it("ignores another child's open timers", () => {
    const notes = headsUp({ ...base, events: [{ event_type: "sleep", kid_id: "other", started_at: iso(1, 0), ended_at: null, payload: {} }] });
    expect(notes.find((n) => n.key === "open-sleep")).toBeUndefined();
  });
});

describe("ageLine", () => {
  it("days, weeks, then years and months", () => {
    expect(ageLine("2026-09-30", now)).toBe("Day 5 · week 1");
    expect(ageLine("2023-02-09", now)).toBe("3 years, 7 months");
  });
});
