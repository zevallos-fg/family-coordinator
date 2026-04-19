import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  text: string;
  stores: Array<{ id: string; name: string }>;
}

export interface Output {
  items: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    storeId: string | null;
    notes: string | null;
  }>;
}

const outputSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      storeId: z.string().nullable(),
      notes: z.string().nullable(),
    })
  ),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.text?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "text is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-grocery-parser",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 600,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input.text, input.stores),
        },
      ],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  try {
    const parsed = outputSchema.parse(parseJsonResponse(result.data));
    return {
      ok: true,
      data: parsed,
      usage: result.usage,
    };
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
