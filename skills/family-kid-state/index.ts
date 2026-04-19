import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  kidName: string;
  currentNotes: string;
  currentFoodFavorites: string[];
  currentFoodAversions: string[];
  newObservation: string;
  observationDate: string;
}

export interface Output {
  updatedNotes: string;
  updatedFoodFavorites: string[];
  updatedFoodAversions: string[];
  summary: string;
}

const outputSchema = z.object({
  updatedNotes: z.string(),
  updatedFoodFavorites: z.array(z.string()),
  updatedFoodAversions: z.array(z.string()),
  summary: z.string(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.kidName?.trim()) {
    return { ok: false, error: { code: "invalid_input", message: "kidName is required" } };
  }
  if (!input.newObservation?.trim()) {
    return { ok: false, error: { code: "invalid_input", message: "newObservation is required" } };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-kid-state",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 600,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  try {
    const parsed = outputSchema.parse(parseJsonResponse(result.data));
    return { ok: true, data: parsed, usage: result.usage };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: err instanceof Error ? `Response did not match expected shape: ${err.message}` : "Response parse failed",
      },
    };
  }
};
