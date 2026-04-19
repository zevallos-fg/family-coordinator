import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  url: string;
  html: string;
}

export interface Output {
  name: string;
  servings: number;
  totalTimeMin: number | null;
  instructions: string[];
  ingredients: Array<{
    canonicalName: string;
    quantity: number | null;
    unit: string | null;
    note: string | null;
  }>;
  sourceUrl: string;
}

const ingredientSchema = z.object({
  canonicalName: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
});

const outputSchema = z.object({
  name: z.string().min(1),
  servings: z.number().int().positive().default(4),
  totalTimeMin: z.number().int().positive().nullable(),
  instructions: z.array(z.string().min(1)),
  ingredients: z.array(ingredientSchema),
  sourceUrl: z.string(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.url?.trim()) {
    return { ok: false, error: { code: "invalid_input", message: "url is required" } };
  }
  if (!input.html?.trim()) {
    return { ok: false, error: { code: "invalid_input", message: "html is required" } };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-recipe-importer",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 1500,
      messages: [{ role: "user", content: buildUserPrompt(input.html, input.url) }],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  try {
    const raw = parseJsonResponse<Record<string, unknown>>(result.data);

    if ("error" in raw && raw.error === "no_recipe_found") {
      return {
        ok: false,
        error: { code: "parse_error", message: "The page does not contain a recipe" },
      };
    }

    const parsed = outputSchema.parse(raw);
    return { ok: true, data: parsed, usage: result.usage };
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
