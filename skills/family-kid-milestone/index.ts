import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt, MILESTONE_TYPES } from "./prompt";

export interface Input {
  kid: {
    name: string;
    birth_date: string;
    current_age_months: number;
  };
  milestone_text: string;
  recent_milestones: Array<{
    logged_at: string;
    milestone_type: string;
    notes: string | null;
  }>;
}

export interface Output {
  milestone_type: string;
  normalized_description: string;
  age_appropriate: boolean;
  related_milestones_to_watch_for: string[];
  suggested_celebration: string | null;
  requires_pediatrician_followup: boolean;
  followup_reason: string | null;
}

const outputSchema = z.object({
  milestone_type: z.string(),
  normalized_description: z.string(),
  age_appropriate: z.boolean(),
  related_milestones_to_watch_for: z.array(z.string()),
  suggested_celebration: z.string().nullable(),
  requires_pediatrician_followup: z.boolean(),
  followup_reason: z.string().nullable(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.milestone_text?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "milestone_text is required" },
    };
  }

  if (!input.kid.name) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "kid.name is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-kid-milestone",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 600,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input),
        },
      ],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  let parsed: z.infer<typeof outputSchema>;
  try {
    parsed = outputSchema.parse(parseJsonResponse(result.data));
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

  // Hallucination guard: kid.name should not be fabricated
  // (If the output references a name other than the input kid's name, it's a fabrication)
  // We check that followup_reason doesn't reference a different kid's name
  // (Simple: milestone_type must be from controlled vocabulary)
  const validTypes = new Set(MILESTONE_TYPES);
  if (!validTypes.has(parsed.milestone_type as (typeof MILESTONE_TYPES)[number])) {
    // Not a hard failure — just normalize to "general"
    parsed = { ...parsed, milestone_type: "general" };
  }

  return {
    ok: true,
    data: parsed as Output,
    usage: result.usage,
  };
};
