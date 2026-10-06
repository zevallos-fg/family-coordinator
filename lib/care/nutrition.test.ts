import { describe, expect, it } from "vitest";
import {
  NUTRIENTS,
  cleanNutrients,
  dayTotals,
  exerciseGate,
  foodPayload,
  localDate,
  localDayBounds,
  mealFor,
  minutesSince,
  movePayload,
  NutritionError,
  progress,
  recentFoods,
  targetsFor,
} from "./nutrition";

describe("lactation targets", () => {
  it("match the verified values", () => {
    const t = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.lactation]));
    expect(t).toMatchObject({
      kcal: null,
      protein_g: 71,
      fiber_g: 29,
      calcium_mg: 1000,
      iron_mg: 9,
      vitamin_d_mcg: 15,
      iodine_mcg: 290,
      choline_mg: 550,
      folate_mcg: 500,
      b12_mcg: 2.8,
      zinc_mg: 12,
      vitamin_c_mg: 120,
      magnesium_mg: 310,
      vitamin_a_mcg: 1300,
      potassium_mg: 2800,
    });
    for (const n of NUTRIENTS) expect(n.source.url).toMatch(/^https:\/\//);
  });
  it("calories never get a default; her own goal wins", () => {
    expect(targetsFor(true).kcal).toBeUndefined();
    const t = targetsFor(true, { kcal: 2400, overrides: { protein_g: 90 } });
    expect(t.kcal).toEqual({ value: 2400, from: "goal" });
    expect(t.protein_g).toEqual({ value: 90, from: "goal" });
    expect(t.fiber_g).toEqual({ value: 29, from: "lactation" });
  });
  it("not breastfeeding → no invented targets", () => {
    expect(targetsFor(false)).toEqual({});
    expect(targetsFor(false, { overrides: { fiber_g: 25 } })).toEqual({ fiber_g: { value: 25, from: "goal" } });
  });
});

describe("food entries", () => {
  it("keeps known nutrients, drops unknown keys, refuses bad numbers", () => {
    expect(cleanNutrients({ protein_g: "20.04", fiber_g: 3, sugar_g: 9 })).toEqual({ protein_g: 20, fiber_g: 3 });
    expect(() => cleanNutrients({ protein_g: -1 })).toThrow(NutritionError);
    expect(() => cleanNutrients({ kcal: 50000 })).toThrow(/typo/);
    expect(() => cleanNutrients([1])).toThrow(NutritionError);
  });
  it("needs a name and a known meal", () => {
    expect(() => foodPayload({ name: " " })).toThrow(/name/);
    expect(() => foodPayload({ name: "Eggs", meal: "brunch" })).toThrow(/meal/);
    expect(foodPayload({ name: "Eggs", meal: "breakfast", nutrients: { protein_g: 12 }, estimated: true, source: "claude_estimate" })).toEqual({
      name: "Eggs",
      meal: "breakfast",
      nutrients: { protein_g: 12 },
      estimated: true,
      source: "claude_estimate",
    });
  });
  it("totals with coverage, so a partial day isn't read as a full one", () => {
    const d = dayTotals([
      { at: "2026-10-05T12:00:00Z", payload: { name: "a", nutrients: { protein_g: 20, calcium_mg: 300 } } },
      { at: "2026-10-05T13:00:00Z", payload: { name: "b", nutrients: { protein_g: 15.5 }, estimated: true } },
    ]);
    expect(d).toMatchObject({ entries: 2, estimated: 1, totals: { protein_g: 35.5, calcium_mg: 300 }, coverage: { protein_g: 2, calcium_mg: 1 } });
    const rows = progress(d, targetsFor(true), ["protein_g", "calcium_mg", "kcal"]);
    expect(rows[0].share).toBeCloseTo(35.5 / 71);
    expect(rows[1]).toMatchObject({ covered: 1, entries: 2 });
    expect(rows[2]).toMatchObject({ value: null, target: null, share: null });
  });
  it("recent foods: most logged first", () => {
    const f = (name: string, at: string) => ({ at, payload: { name, nutrients: {} } });
    const r = recentFoods([f("Oats", "2026-10-01T08:00:00Z"), f("Yogurt", "2026-10-04T08:00:00Z"), f("oats", "2026-10-03T08:00:00Z")]);
    expect(r.map((x) => x.name)).toEqual(["oats", "Yogurt"]);
  });
  it("meal defaults by hour", () => {
    expect([mealFor(7), mealFor(12), mealFor(16), mealFor(19), mealFor(23)]).toEqual(["breakfast", "lunch", "snack", "dinner", "snack"]);
  });
});

describe("movement", () => {
  it("validates activity and minutes", () => {
    expect(() => movePayload({ activity: "run", minutes: 10 })).toThrow(/activity/);
    expect(() => movePayload({ activity: "walk", minutes: 0 })).toThrow(/minutes/);
    expect(movePayload({ activity: "walk", minutes: 10.4, steps: 1200 })).toEqual({ activity: "walk", minutes: 10, steps: 1200 });
  });
  it("after a cesarean, no weekly goal until the OB clears her", () => {
    expect(exerciseGate({ delivery_type: "cesarean", exercise_cleared_on: null }).gated).toBe(true);
    expect(exerciseGate({ delivery_type: "cesarean", exercise_cleared_on: "2026-11-10" }).gated).toBe(false);
    expect(exerciseGate({ delivery_type: "vaginal" }).gated).toBe(false);
    expect(exerciseGate(null).source.url).toContain("acog.org");
  });
  it("sums minutes in a window", () => {
    const m = (at: string, minutes: number) => ({ at, payload: { activity: "walk" as const, minutes } });
    expect(minutesSince([m("2026-10-01T10:00:00Z", 10), m("2026-10-05T10:00:00Z", 20)], Date.parse("2026-10-02T00:00:00Z"))).toBe(20);
  });
});

describe("local days", () => {
  it("bounds a New York day, across the DST change", () => {
    const [s, e] = localDayBounds("2026-10-05", "America/New_York");
    expect(new Date(s).toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(new Date(e).toISOString()).toBe("2026-10-06T04:00:00.000Z");
    const [s2, e2] = localDayBounds("2026-11-01", "America/New_York");
    expect((e2 - s2) / 3600_000).toBe(25);
    expect(localDate(Date.parse("2026-10-06T02:00:00Z"), "America/New_York")).toBe("2026-10-05");
    expect(() => localDayBounds("10/5", "America/New_York")).toThrow(NutritionError);
  });
});
