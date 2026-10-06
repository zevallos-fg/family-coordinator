import { describe, expect, it } from "vitest";
import {
  AFTER_CLEARANCE,
  BEFORE_CLEARANCE,
  ExpertError,
  NOT_APPLIED,
  PER_MEAL_NOTES,
  PROTEIN_METHODS,
  proteinByMeal,
  proteinGoalNote,
  proteinRange,
} from "./experts";

describe("expert protein methods", () => {
  it("Lyon applies to goal weight, Sims to current weight, both 0.7–1.0 g/lb", () => {
    expect(PROTEIN_METHODS.lyon.weightBasis).toBe("goal");
    expect(PROTEIN_METHODS.sims.weightBasis).toBe("current");
    expect(proteinRange("lyon", 140)).toEqual({ low: 98, high: 140 });
    expect(proteinRange("sims", 155)).toEqual({ low: 109, high: 155 });
  });
  it("refuses a weight that isn't plausible pounds", () => {
    expect(() => proteinRange("lyon", 63)).toThrow(ExpertError);
    expect(() => proteinRange("sims", Number.NaN)).toThrow(ExpertError);
  });
  it("notes where a goal came from", () => {
    expect(proteinGoalNote("lyon", 140, 140)).toBe("Dr. Lyon: 1 g/lb × 140 lb goal weight");
    expect(proteinGoalNote("sims", 155, 109)).toBe("Dr. Sims: 0.7 g/lb × 155 lb current weight");
  });
});

describe("protein by meal", () => {
  it("sums per meal; no meal counts as a snack", () => {
    const r = proteinByMeal([
      { payload: { meal: "breakfast", nutrients: { protein_g: 12 } } },
      { payload: { meal: "breakfast", nutrients: { protein_g: 20 } } },
      { payload: { nutrients: { protein_g: 17 } } },
      { payload: { meal: "lunch", nutrients: {} } },
    ]);
    expect(r).toEqual([
      { meal: "breakfast", grams: 32, entries: 2 },
      { meal: "lunch", grams: 0, entries: 1 },
      { meal: "dinner", grams: 0, entries: 0 },
      { meal: "snack", grams: 17, entries: 1 },
    ]);
  });
});

describe("every expert note is quoted and sourced", () => {
  it("has a quote and an https source from their own site or show transcript", () => {
    for (const n of [...PER_MEAL_NOTES, ...BEFORE_CLEARANCE, ...AFTER_CLEARANCE, PROTEIN_METHODS.lyon, PROTEIN_METHODS.sims]) {
      expect(n.quote.length).toBeGreaterThan(20);
      expect(n.source.url).toMatch(/^https:\/\/(www\.)?(drgabriellelyon\.com|drstacysims\.com|hubermanlab\.com)\//);
    }
    for (const n of NOT_APPLIED) expect(n.sources.length).toBeGreaterThan(0);
  });
  it("before clearance, both point back to the doctor or easing in", () => {
    expect(BEFORE_CLEARANCE.map((n) => n.who).sort()).toEqual(["lyon", "sims"]);
    expect(BEFORE_CLEARANCE.find((n) => n.who === "lyon")?.quote).toMatch(/doctor/);
  });
});
