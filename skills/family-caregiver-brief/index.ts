import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  caregiver: { name: string; role: string };
  kids: Array<{
    name: string;
    birthDate: string | null;
    notes: string;
    foodFavorites: string[];
    foodAversions: string[];
  }>;
  shift: { startAt: string; endAt: string };
  openTasks: Array<{ title: string; dueDate?: string }>;
  previousRecap?: string;
}

export interface Output {
  content: string;
}

const outputSchema = z.object({
  content: z.string().min(1),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.caregiver?.name?.trim()) {
    return { ok: false, error: { code: "invalid_input", message: "caregiver.name is required" } };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-caregiver-brief",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 1200,
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
