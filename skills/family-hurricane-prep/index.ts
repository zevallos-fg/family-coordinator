import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt, NAMED_STORM_PATTERN, CROSS_REGION_PATTERN } from "./prompt";

export interface Input {
  family_id: string;
  current_date: string;
  location: "miami_fl";
  household: {
    adults: number;
    kids: number;
    pets?: number;
    home_type: string;
  };
}

export type SeasonPhase = "pre_season" | "active_season" | "imminent" | "post_season";

export interface ChecklistItem {
  text: string;
  category: string;
  priority: string;
  due_by_offset_days: number;
}

export interface Output {
  season_phase: SeasonPhase;
  checklist_items: ChecklistItem[];
}

const outputSchema = z.object({
  season_phase: z.enum(["pre_season", "active_season", "imminent", "post_season"]),
  checklist_items: z.array(
    z.object({
      text: z.string(),
      category: z.string(),
      priority: z.string(),
      due_by_offset_days: z.number().int().min(0),
    })
  ),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.current_date) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "current_date is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-hurricane-prep",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 1000,
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

  // Hallucination guard 1: no named storm references
  const namedStormViolations = parsed.checklist_items.filter((item) =>
    NAMED_STORM_PATTERN.test(item.text)
  );
  if (namedStormViolations.length > 0) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: `Hallucination guard: named storm reference in output: "${namedStormViolations[0].text}"`,
      },
    };
  }

  // Hallucination guard 2: no cross-region hazards (snow, wildfire, earthquake)
  const crossRegionViolations = parsed.checklist_items.filter((item) =>
    CROSS_REGION_PATTERN.test(item.text)
  );
  if (crossRegionViolations.length > 0) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: `Hallucination guard: non-Miami hazard in output: "${crossRegionViolations[0].text}"`,
      },
    };
  }

  return {
    ok: true,
    data: parsed as Output,
    usage: result.usage,
  };
};
