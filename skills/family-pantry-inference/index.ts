import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  barcode: string;
}

export interface Output {
  productName: string | null;
  brand: string | null;
  category: string | null;
  confidence: "high" | "medium" | "low";
  note: string | null;
}

const outputSchema = z.object({
  productName: z.string().nullable(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.barcode?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "barcode is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-pantry-inference",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 300,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input.barcode),
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
