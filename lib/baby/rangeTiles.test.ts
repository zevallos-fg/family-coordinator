import { describe, expect, it } from "vitest";
import { rangeTiles } from "./rangeTiles";
import { guidesFor } from "./glance";
import type { DayStats } from "./reports";

const day = (d: number, x: Partial<DayStats>): DayStats => ({
  dayStart: new Date(2026, 9, d).getTime(),
  logged: true, nightMs: 0, napMs: 0, feeds: 0, nursingMs: 0, bottles: 0, wet: 0, dirty: 0, diapers: 0, peeOnly: 0, mixed: 0, pooOnly: 0, dry: 0,
  ...x,
});
const guideAt = (ms: number) => guidesFor("2026-09-30", new Date(ms + 12 * 3600_000));

describe("rangeTiles", () => {
  it("a finished day: flags below and above, says within otherwise", () => {
    const t = rangeTiles([day(4, { feeds: 13, wet: 5, dirty: 4, nightMs: 8 * 3600_000, napMs: 7 * 3600_000 })], guideAt(new Date(2026, 9, 4).getTime()), guideAt, { partial: false, average: false });
    const by = Object.fromEntries(t.map((x) => [x.key, x.status]));
    // Oct 4 is day 4: the early diaper ranges (2–3 wet, 2+ dirty) still apply.
    expect(by).toEqual({ sleep: "within", feeds: "above", wet: "within", dirty: "within" });
  });
  it("today so far is never called below", () => {
    const t = rangeTiles([day(5, { feeds: 3, wet: 1 })], guideAt(new Date(2026, 9, 5).getTime()), guideAt, { partial: true, average: false });
    expect(t.find((x) => x.key === "wet")?.status).toBeNull();
  });
  it("an average only uses days under today's range", () => {
    // Day 4 (range 2–3 wet) had 2; days 5 and 6 (range 6+) had 7 and 5 → avg 6 → within.
    const days = [day(4, { wet: 2 }), day(5, { wet: 7 }), day(6, { wet: 5 })];
    const t = rangeTiles(days, guideAt(new Date(2026, 9, 6).getTime()), guideAt, { partial: false, average: true });
    expect(t.find((x) => x.key === "wet")).toMatchObject({ value: "6", status: "within" });
  });
  it("no days, no verdict", () => {
    const t = rangeTiles([], guideAt(new Date(2026, 9, 5).getTime()), guideAt, { partial: false, average: true });
    expect(t.every((x) => x.status === null)).toBe(true);
  });
});
