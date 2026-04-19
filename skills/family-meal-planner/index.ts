import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  recipes: Array<{
    id: string;
    name: string;
    servings: number;
    totalTimeMin: number | null;
    ingredients: Array<{
      canonicalName: string;
      quantity: number | null;
      unit: string | null;
    }>;
  }>;
  pantry: Array<{
    ingredientName: string;
    quantity: number;
    unit: string;
  }>;
  mealsNeeded: Array<{
    date: string;
    mealTypes: Array<"breakfast" | "lunch" | "dinner">;
  }>;
  preferences: {
    servingsPerMeal: number;
    dislikes: string[];
    dietaryConstraints: string[];
    varietyPreference: "high" | "medium" | "low";
  };
}

export interface Output {
  entries: Array<{
    date: string;
    mealType: "breakfast" | "lunch" | "dinner";
    recipeId: string | null;
    notes: string | null;
  }>;
  groceryDelta: Array<{
    name: string;
    quantityNeeded: number | null;
    unit: string | null;
    suggestedStore: string | null;
  }>;
  rationale: string;
}

const entrySchema = z.object({
  date: z.string(),
  mealType: z.enum(["breakfast", "lunch", "dinner"]),
  recipeId: z.string().nullable(),
  notes: z.string().nullable(),
});

const groceryDeltaSchema = z.object({
  name: z.string().min(1),
  quantityNeeded: z.number().nullable(),
  unit: z.string().nullable(),
  suggestedStore: z.string().nullable(),
});

const outputSchema = z.object({
  entries: z.array(entrySchema),
  groceryDelta: z.array(groceryDeltaSchema),
  rationale: z.string().min(1),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.recipes || input.recipes.length === 0) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "at least one recipe is required" },
    };
  }
  if (!input.mealsNeeded || input.mealsNeeded.length === 0) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "mealsNeeded cannot be empty" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-meal-planner",
      tier: "sonnet",
      system: SYSTEM_PROMPT,
      maxTokens: 4000,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  try {
    const raw = parseJsonResponse<unknown>(result.data);
    const parsed = outputSchema.parse(raw);

    // Validate recipeIds are in the input — Sonnet can hallucinate
    const validIds = new Set(input.recipes.map(r => r.id));
    const sanitized: Output = {
      ...parsed,
      entries: parsed.entries.map(e => {
        if (e.recipeId && !validIds.has(e.recipeId)) {
          return { ...e, recipeId: null, notes: "plan generation error: invalid recipe reference" };
        }
        return e;
      }),
    };

    return { ok: true, data: sanitized, usage: result.usage };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: err instanceof Error
          ? `Response did not match expected shape: ${err.message}`
          : "Response parse failed",
      },
    };
  }
};
