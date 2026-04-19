import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  imageBase64: string;
  imageMimeType: "image/jpeg" | "image/png";
  weekOf: string;
  knownNames: string[];
}

export interface Output {
  days: Array<{
    date: string;
    duties: {
      dropoff: { assignee: string; confidence: number };
      pickup: { assignee: string; confidence: number };
      nap?: { assignee: string; confidence: number };
    };
    events: Array<{
      title: string;
      startTime: string;
      endTime: string;
      color: string;
      assignee: string | null;
      ignored: boolean;
    }>;
  }>;
}

const dutySchema = z.object({
  assignee: z.string(),
  confidence: z.number(),
});

const outputSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      duties: z.object({
        dropoff: dutySchema,
        pickup: dutySchema,
        nap: dutySchema.optional(),
      }),
      events: z.array(
        z.object({
          title: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          color: z.string(),
          assignee: z.string().nullable(),
          ignored: z.boolean(),
        })
      ),
    })
  ),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.imageBase64?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "imageBase64 is required" },
    };
  }

  if (!input.weekOf?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "weekOf is required" },
    };
  }

  if (!input.knownNames?.length) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "knownNames must not be empty" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-schedule-reconciler",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.imageMimeType,
                data: input.imageBase64,
              },
            },
            {
              type: "text",
              text: buildUserPrompt(input.weekOf, input.knownNames),
            },
          ],
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
