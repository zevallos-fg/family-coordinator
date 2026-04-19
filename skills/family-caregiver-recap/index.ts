import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  kidName: string;
  shiftTimes: { startAt: string; endAt: string };
  caregiverText: string;
}

export interface Output {
  summary: string;
  structuredData: {
    sleep?: {
      napStart?: string | null;
      napEnd?: string | null;
      durationMin?: number | null;
      quality?: string | null;
    };
    meals?: Array<{
      time?: string | null;
      description: string;
      amountEaten?: "all" | "some" | "none";
    }>;
    moodEvents?: Array<{ time?: string | null; description: string }>;
    health?: {
      symptoms?: string[];
      medications?: Array<{ name: string; time: string; dose?: string }>;
    };
    other?: string[];
  };
  parentsShouldKnow: string[];
}

const mealSchema = z.object({
  time: z.string().nullable().optional(),
  description: z.string(),
  amountEaten: z.enum(["all", "some", "none"]).optional(),
});

const outputSchema = z.object({
  summary: z.string(),
  structuredData: z.object({
    sleep: z
      .object({
        napStart: z.string().nullable().optional(),
        napEnd: z.string().nullable().optional(),
        durationMin: z.number().nullable().optional(),
        quality: z.string().nullable().optional(),
      })
      .optional(),
    meals: z.array(mealSchema).optional(),
    moodEvents: z
      .array(z.object({ time: z.string().nullable().optional(), description: z.string() }))
      .optional(),
    health: z
      .object({
        symptoms: z.array(z.string()).optional(),
        medications: z
          .array(z.object({ name: z.string(), time: z.string(), dose: z.string().optional() }))
          .optional(),
      })
      .optional(),
    other: z.array(z.string()).optional(),
  }),
  parentsShouldKnow: z.array(z.string()),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.caregiverText?.trim()) {
    return { ok: false, error: { code: "invalid_input", message: "caregiverText is required" } };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-caregiver-recap",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 800,
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
