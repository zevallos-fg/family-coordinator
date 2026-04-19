import { describe, it, expect } from "vitest";
import {
  defaultPlanWeek,
  parseWeekParam,
  formatWeekRange,
  formatWeekParam,
  clampWeek,
  addDays,
} from "./week";

// Helper: build a local-noon Date from an ISO date string to avoid UTC drift in tests
function d(iso: string): Date {
  return new Date(iso + "T12:00:00");
}

describe("defaultPlanWeek", () => {
  it("Mon Apr 20 → Apr 20 (this Monday)", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-20")))).toBe("2026-04-20");
  });
  it("Tue Apr 21 → Apr 20", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-21")))).toBe("2026-04-20");
  });
  it("Wed Apr 22 → Apr 20", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-22")))).toBe("2026-04-20");
  });
  it("Thu Apr 23 → Apr 20", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-23")))).toBe("2026-04-20");
  });
  it("Fri Apr 24 → Apr 27 (next Monday)", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-24")))).toBe("2026-04-27");
  });
  it("Sat Apr 25 → Apr 27", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-25")))).toBe("2026-04-27");
  });
  it("Sun Apr 26 → Apr 27", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-26")))).toBe("2026-04-27");
  });
  it("Thu Apr 23 → Apr 20, same-time Fri Apr 24 → Apr 27 (transition day)", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-23")))).toBe("2026-04-20");
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-24")))).toBe("2026-04-27");
  });
  it("Mon Apr 27 → Apr 27 (this Monday, new week begins)", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-04-27")))).toBe("2026-04-27");
  });
  it("Sun Dec 27 2026 → Dec 28 2026 (Sunday must still go to next Mon, not this Mon)", () => {
    expect(formatWeekParam(defaultPlanWeek(d("2026-12-27")))).toBe("2026-12-28");
  });
});

describe("parseWeekParam", () => {
  // Sunday Apr 19: dow=0, isEarlyWeek=false → defaultPlanWeek = addDays(Apr 13, 7) = Apr 20
  const today = d("2026-04-19"); // Sunday → defaultPlanWeek = Apr 20

  it("valid Monday → returns the date", () => {
    expect(formatWeekParam(parseWeekParam("2026-04-20", today))).toBe("2026-04-20");
  });
  it("non-Monday date (e.g. Wed) → snaps to the containing Monday", () => {
    expect(formatWeekParam(parseWeekParam("2026-04-22", today))).toBe("2026-04-20");
  });
  it("invalid string → falls back to defaultPlanWeek(today)", () => {
    expect(formatWeekParam(parseWeekParam("not-a-date", today))).toBe("2026-04-20");
  });
  it("null → falls back to defaultPlanWeek(today)", () => {
    expect(formatWeekParam(parseWeekParam(null, today))).toBe("2026-04-20");
  });
});

describe("formatWeekRange", () => {
  it("Apr 20 → 'Apr 20 — 26'", () => {
    expect(formatWeekRange(d("2026-04-20"))).toBe("Apr 20 — 26");
  });
  it("Apr 27 → 'Apr 27 — May 3' (cross-month boundary)", () => {
    expect(formatWeekRange(d("2026-04-27"))).toBe("Apr 27 — May 3");
  });
  it("Dec 29 → 'Dec 29 — Jan 4' (cross-year boundary)", () => {
    expect(formatWeekRange(d("2025-12-29"))).toBe("Dec 29 — Jan 4");
  });
});

describe("clampWeek", () => {
  // Tuesday Apr 21 → defaultPlanWeek = Apr 20 (Mon–Thu bucket)
  const today = d("2026-04-21");

  it("target within range → returns target", () => {
    const target = d("2026-04-27");
    expect(formatWeekParam(clampWeek(target, today, 8))).toBe("2026-04-27");
  });
  it("target beyond +N → returns +N boundary", () => {
    const tooFar = d("2027-01-01");
    const clamped = clampWeek(tooFar, today, 4);
    // anchor = Apr 20, +4 weeks = May 18
    expect(formatWeekParam(clamped)).toBe(formatWeekParam(addDays(d("2026-04-20"), 4 * 7)));
  });
  it("target before -N → returns -N boundary", () => {
    const tooEarly = d("2020-01-01");
    const clamped = clampWeek(tooEarly, today, 4);
    // anchor = Apr 20, -4 weeks = Mar 23
    expect(formatWeekParam(clamped)).toBe(formatWeekParam(addDays(d("2026-04-20"), -4 * 7)));
  });
});
