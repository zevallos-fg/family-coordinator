import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";
import type { Input } from "./index";

vi.mock("../_lib/runner", () => ({
  callSkill: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { run } from "./index";
import { callSkill } from "../_lib/runner";

const mockCallSkill = vi.mocked(callSkill);

const TEST_CTX: SkillContext = {
  familyId: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  userId: "a4b2af94-06f5-4a25-b84f-aecb89da9191",
};

const RECIPES = [
  {
    id: "11111111-1111-4111-a111-111111111111",
    name: "Chicken Stir Fry",
    servings: 4,
    totalTimeMin: 30,
    ingredients: [
      { canonicalName: "chicken breast", quantity: 1, unit: "lb" },
      { canonicalName: "soy sauce", quantity: 3, unit: "tablespoons" },
      { canonicalName: "garlic", quantity: 3, unit: "cloves" },
      { canonicalName: "broccoli", quantity: 2, unit: "cups" },
    ],
  },
  {
    id: "22222222-2222-4222-a222-222222222222",
    name: "Pasta Marinara",
    servings: 4,
    totalTimeMin: 25,
    ingredients: [
      { canonicalName: "penne pasta", quantity: 12, unit: "oz" },
      { canonicalName: "crushed tomato", quantity: 28, unit: "oz" },
      { canonicalName: "garlic", quantity: 4, unit: "cloves" },
      { canonicalName: "olive oil", quantity: 3, unit: "tablespoons" },
    ],
  },
  {
    id: "33333333-3333-4333-a333-333333333333",
    name: "Shrimp Tacos",
    servings: 4,
    totalTimeMin: 20,
    ingredients: [
      { canonicalName: "shrimp", quantity: 1, unit: "lb" },
      { canonicalName: "corn tortilla", quantity: 8, unit: null },
      { canonicalName: "lime", quantity: 2, unit: null },
      { canonicalName: "cabbage", quantity: 1, unit: "cup" },
    ],
  },
  {
    id: "44444444-4444-4444-a444-444444444444",
    name: "Oatmeal",
    servings: 2,
    totalTimeMin: 10,
    ingredients: [
      { canonicalName: "rolled oat", quantity: 1, unit: "cup" },
      { canonicalName: "milk", quantity: 2, unit: "cups" },
      { canonicalName: "honey", quantity: 2, unit: "tablespoons" },
    ],
  },
  {
    id: "55555555-5555-4555-a555-555555555555",
    name: "Lentil Soup",
    servings: 6,
    totalTimeMin: 45,
    ingredients: [
      { canonicalName: "lentil", quantity: 2, unit: "cups" },
      { canonicalName: "chicken broth", quantity: 4, unit: "cups" },
      { canonicalName: "carrot", quantity: 3, unit: null },
      { canonicalName: "onion", quantity: 1, unit: null },
    ],
  },
];

const SEVEN_DAYS: Input["mealsNeeded"] = [
  { date: "2026-04-21", mealTypes: ["breakfast", "lunch", "dinner"] },
  { date: "2026-04-22", mealTypes: ["breakfast", "lunch", "dinner"] },
  { date: "2026-04-23", mealTypes: ["breakfast", "lunch", "dinner"] },
  { date: "2026-04-24", mealTypes: ["breakfast", "lunch", "dinner"] },
  { date: "2026-04-25", mealTypes: ["breakfast", "lunch", "dinner"] },
  { date: "2026-04-26", mealTypes: ["breakfast", "lunch", "dinner"] },
  { date: "2026-04-27", mealTypes: ["breakfast", "lunch", "dinner"] },
];

function mockPlanResponse(entries: Array<{ date: string; mealType: string; recipeId: string | null; notes: string | null }>, groceryDelta: Array<{ name: string; quantityNeeded: number | null; unit: string | null; suggestedStore: string | null }> = []) {
  return {
    ok: true as const,
    data: JSON.stringify({
      entries,
      groceryDelta,
      rationale: "Plan balances variety with ingredient reuse. Pantry garlic reduces grocery spend. Shrimp was excluded per dietary dislikes.",
    }),
    usage: { model: "claude-sonnet-4-6", inputTokens: 2000, outputTokens: 1500, costCents: 2.85 },
  };
}

describe("family-meal-planner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a valid meal plan response", async () => {
    const entries = SEVEN_DAYS.flatMap(day =>
      day.mealTypes.map(mealType => ({
        date: day.date,
        mealType,
        recipeId: mealType === "breakfast" ? RECIPES[3].id : RECIPES[0].id,
        notes: null,
      }))
    );

    mockCallSkill.mockResolvedValueOnce(mockPlanResponse(entries, [
      { name: "chicken breast", quantityNeeded: 7, unit: "lb", suggestedStore: null },
      { name: "broccoli", quantityNeeded: 14, unit: "cups", suggestedStore: null },
    ]));

    const result = await run({
      recipes: RECIPES,
      pantry: [],
      mealsNeeded: SEVEN_DAYS,
      preferences: { servingsPerMeal: 4, dislikes: [], dietaryConstraints: [], varietyPreference: "medium" },
    }, TEST_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data!.entries).toHaveLength(21);
    expect(result.data!.groceryDelta).toHaveLength(2);
    expect(result.data!.rationale).toBeTruthy();
  });

  it("sanitizes hallucinated recipeIds not in input", async () => {
    const FAKE_ID = "99999999-9999-4999-a999-999999999999";
    const entries = SEVEN_DAYS.flatMap(day =>
      day.mealTypes.map((mealType, i) => ({
        date: day.date,
        mealType,
        recipeId: i === 0 ? FAKE_ID : RECIPES[0].id, // hallucinated id for breakfast
        notes: null,
      }))
    );

    mockCallSkill.mockResolvedValueOnce(mockPlanResponse(entries));

    const result = await run({
      recipes: RECIPES,
      pantry: [],
      mealsNeeded: SEVEN_DAYS,
      preferences: { servingsPerMeal: 4, dislikes: [], dietaryConstraints: [], varietyPreference: "medium" },
    }, TEST_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Hallucinated IDs become null
    const nullEntries = result.data!.entries.filter(e => e.recipeId === null);
    expect(nullEntries.length).toBeGreaterThan(0);
    expect(nullEntries[0].notes).toContain("error");
  });

  it("returns invalid_input when no recipes provided", async () => {
    const result = await run({
      recipes: [],
      pantry: [],
      mealsNeeded: SEVEN_DAYS,
      preferences: { servingsPerMeal: 4, dislikes: [], dietaryConstraints: [], varietyPreference: "medium" },
    }, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("invalid_input");
  });

  it("handles parse_error gracefully when Sonnet returns garbage", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: "I'm sorry, I cannot generate a meal plan right now.",
      usage: { model: "claude-sonnet-4-6", inputTokens: 100, outputTokens: 20, costCents: 0.1 },
    });

    const result = await run({
      recipes: RECIPES,
      pantry: [],
      mealsNeeded: SEVEN_DAYS,
      preferences: { servingsPerMeal: 4, dislikes: ["shrimp"], dietaryConstraints: [], varietyPreference: "high" },
    }, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("parse_error");
  });

  it("propagates budget_exceeded from callSkill", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: false,
      error: { code: "budget_exceeded", message: "monthly cap reached" },
    });

    const result = await run({
      recipes: RECIPES,
      pantry: [],
      mealsNeeded: SEVEN_DAYS,
      preferences: { servingsPerMeal: 4, dislikes: [], dietaryConstraints: [], varietyPreference: "medium" },
    }, TEST_CTX);

    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("budget_exceeded");
  });

  it("includes grocery delta items in parsed output", async () => {
    const entries = SEVEN_DAYS.slice(0, 2).flatMap(day =>
      day.mealTypes.map(mealType => ({
        date: day.date,
        mealType,
        recipeId: RECIPES[0].id,
        notes: null,
      }))
    );

    const groceryDelta = [
      { name: "chicken breast", quantityNeeded: 2, unit: "lb", suggestedStore: "Publix" },
      { name: "soy sauce", quantityNeeded: null, unit: null, suggestedStore: null },
    ];

    mockCallSkill.mockResolvedValueOnce(mockPlanResponse(entries, groceryDelta));

    const result = await run({
      recipes: RECIPES,
      pantry: [{ ingredientName: "garlic", quantity: 5, unit: "cloves" }],
      mealsNeeded: SEVEN_DAYS.slice(0, 2),
      preferences: { servingsPerMeal: 4, dislikes: [], dietaryConstraints: [], varietyPreference: "medium" },
    }, TEST_CTX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chicken = result.data!.groceryDelta.find(g => g.name === "chicken breast");
    expect(chicken).toBeDefined();
    expect(chicken!.quantityNeeded).toBe(2);
    expect(chicken!.suggestedStore).toBe("Publix");
  });
});
