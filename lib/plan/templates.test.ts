import { describe, expect, it } from "vitest";
import { MEDICAL_VISIT, NEWBORN_VISIT, POSTPARTUM_VISIT, PRESCHOOL_VISIT, SCHOOL_MEETING, templateFor } from "./templates";
import { ageDaysOn, formatWhen, relativeDay, starterItems, startsAtFrom } from "./events";

const ALL = { NEWBORN_VISIT, PRESCHOOL_VISIT, MEDICAL_VISIT, SCHOOL_MEETING };

describe("templates", () => {
  for (const [name, items] of Object.entries(ALL)) {
    it(`${name}: every item has an https source and a unique key`, () => {
      const keys = new Set<string>();
      for (const it of items) {
        expect(it.source.url.startsWith("https://"), it.key).toBe(true);
        expect(keys.has(it.key), it.key).toBe(false);
        keys.add(it.key);
      }
    });
    it(`${name}: no dose amounts in any item`, () => {
      for (const it of items) expect(`${it.body} ${it.detail ?? ""}`).not.toMatch(/\b(IU|mg|ml|mcg)\b/i);
    });
  }
});

describe("templateFor", () => {
  it("a 7-day-old's doctor visit gets the newborn list", () => {
    expect(templateFor("medical", 7)?.items).toBe(NEWBORN_VISIT);
  });
  it("a 3-year-8-month-old's checkup gets the preschool list", () => {
    expect(templateFor("medical", 1334)?.items).toBe(PRESCHOOL_VISIT);
  });
  it("other ages get the short general list, not one written for another age", () => {
    expect(templateFor("medical", 200)?.items).toBe(MEDICAL_VISIT);
    expect(templateFor("medical", null)?.items).toBe(MEDICAL_VISIT);
  });
  it("school meetings get the teacher list; other kinds start empty", () => {
    expect(templateFor("school", 1334)?.items).toBe(SCHOOL_MEETING);
    expect(templateFor("family", 7)).toBeNull();
  });
});

describe("events helpers", () => {
  it("reads date and time as local time; no time means noon", () => {
    const iso = startsAtFrom("2026-10-07", "14:40")!;
    const d = new Date(iso);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([7, 14, 40]);
    expect(new Date(startsAtFrom("2026-10-07", "")!).getHours()).toBe(12);
    expect(startsAtFrom("Oct 7", "14:40")).toBeNull();
  });
  it("age on the day of the event, not today", () => {
    expect(ageDaysOn("2026-09-30", new Date(2026, 9, 7, 14, 40))).toBe(7);
  });
  it("starter rows carry the source and keep template order", () => {
    const { rows } = starterItems("medical", "2026-09-30", new Date(2026, 9, 7, 14, 40).toISOString(), {
      eventId: "e",
      familyId: "f",
    });
    expect(rows.length).toBe(NEWBORN_VISIT.length);
    expect(rows[0]).toMatchObject({ event_id: "e", family_id: "f", position: 0, template_key: "gen-top3" });
    expect(rows.every((r) => r.source_url.startsWith("https://"))).toBe(true);
  });
});

describe("time zone", () => {
  it("prints the family's local time even when rendered on a UTC server", () => {
    expect(formatWhen("2026-10-07T18:40:00Z", "America/New_York")).toBe("Wed, Oct 7 · 2:40 pm");
  });
  it("counts calendar days in the family's zone", () => {
    // 9pm Monday in Miami is already Tuesday in UTC.
    const now = new Date("2026-10-06T01:00:00Z");
    expect(relativeDay("2026-10-07T18:40:00Z", now, "America/New_York")).toBe("in 2 days");
  });
});

describe("postpartum visit", () => {
  it("within 12 weeks of a C-section: the postpartum list with the incision question, all sourced", async () => {
    const { starterItems } = await import("./events");
    const { rows, name } = starterItems("medical", null, new Date(2026, 9, 20, 10).toISOString(), { eventId: "e", familyId: "f" }, { deliveredOn: "2026-09-30", cesarean: true });
    expect(name).toBe("Postpartum visit");
    expect(rows.map((r) => r.template_key)).toContain("pp-incision");
    expect(rows.every((r) => r.source_url.startsWith("https://"))).toBe(true);
  });
  it("no incision question after a vaginal birth; past 12 weeks it's the general list", async () => {
    const { starterItems } = await import("./events");
    expect(starterItems("medical", null, new Date(2026, 9, 20).toISOString(), { eventId: "e", familyId: "f" }, { deliveredOn: "2026-09-30", cesarean: false }).rows.map((r) => r.template_key)).not.toContain("pp-incision");
    expect(starterItems("medical", null, new Date(2027, 1, 1).toISOString(), { eventId: "e", familyId: "f" }, { deliveredOn: "2026-09-30", cesarean: true }).name).toBe("Doctor visit");
  });
  it("no doses in the postpartum list either", () => {
    for (const it of POSTPARTUM_VISIT) expect(`${it.body} ${it.detail ?? ""}`).not.toMatch(/\b(IU|mg|ml|mcg)\b/i);
  });
});
