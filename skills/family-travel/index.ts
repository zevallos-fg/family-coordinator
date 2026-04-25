import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  destination: string;
  start_date: string;
  end_date: string;
  household: {
    adults: Array<{ name: string }>;
    kids: Array<{ name: string; age_years: number }>;
  };
  notes?: string;
}

export interface PackingItem {
  item: string;
  owner: string;
  category: string;
  quantity: number | null;
}

export interface PrepTask {
  task: string;
  days_before_departure: number;
}

export interface Output {
  packing_list: PackingItem[];
  prep_tasks: PrepTask[];
}

const outputSchema = z.object({
  packing_list: z.array(
    z.object({
      item: z.string(),
      owner: z.string(),
      category: z.string(),
      quantity: z.number().nullable().optional(),
    })
  ),
  prep_tasks: z.array(
    z.object({
      task: z.string(),
      days_before_departure: z.number().int().positive(),
    })
  ),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.destination?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "destination is required" },
    };
  }

  if (!input.start_date || !input.end_date) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "start_date and end_date are required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-travel",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 1200,
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

  // Hallucination guard: every owner must be a valid name from input OR "shared"
  const validOwners = new Set<string>(["shared"]);
  input.household.adults.forEach((a) => validOwners.add(a.name));
  input.household.kids.forEach((k) => validOwners.add(`kid_${k.name}`));

  const fabricatedOwners = parsed.packing_list.filter((p) => !validOwners.has(p.owner));
  if (fabricatedOwners.length > 0) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: `Hallucination guard: owner values not in input household: ${fabricatedOwners.map((f) => f.owner).join(", ")}`,
      },
    };
  }

  return {
    ok: true,
    data: {
      packing_list: parsed.packing_list.map((p) => ({
        ...p,
        quantity: p.quantity ?? null,
      })),
      prep_tasks: parsed.prep_tasks,
    },
    usage: result.usage,
  };
};
