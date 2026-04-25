import { z } from "zod";
import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  cleanedName: string;
  candidates: Array<{ id: string; canonical_name: string }>;
}

export interface Output {
  resolvedId: string | null;
  confidence: "haiku" | "unmatched";
}

const outputSchema = z.object({
  resolvedId: z.string().uuid().nullable(),
  confidence: z.enum(["haiku", "unmatched"]),
});

export const run: SkillRunner<Input, Output> = async (
  input: Input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.cleanedName?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "cleanedName is required" },
    };
  }

  if (!input.candidates || input.candidates.length === 0) {
    return {
      ok: true,
      data: { resolvedId: null, confidence: "unmatched" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-ingredient-resolver",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 150,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input.cleanedName, input.candidates),
        },
      ],
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
        message:
          err instanceof Error
            ? `Response did not match expected shape: ${err.message}`
            : "Response parse failed",
      },
    };
  }
};
