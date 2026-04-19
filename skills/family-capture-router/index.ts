import { z } from "zod";

import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  text: string;
  categories: Array<{ id: string; name: string }>;
}

export interface Output {
  categoryId: string | null;
  isGrocery: boolean;
  groceryItems: string[];
}

const outputSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  isGrocery: z.boolean(),
  groceryItems: z.array(z.string()),
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
      skillName: "family-capture-router",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 500,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input.text, input.categories),
        },
      ],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  try {
    const parsed = outputSchema.parse(JSON.parse(result.data));
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
