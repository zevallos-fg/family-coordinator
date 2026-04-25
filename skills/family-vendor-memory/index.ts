import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface VendorInput {
  id: string;
  name: string;
  category: string;
  last_used_at: string | null;
  notes: string | null;
  services: string[];
}

export interface Input {
  queryText: string;
  vendors: VendorInput[];
}

export interface Output {
  matches: Array<{
    vendor_id: string;
    relevance_score: number;
    why_matched: string;
  }>;
  suggestion: string | null;
}

const outputSchema = z.object({
  matches: z.array(
    z.object({
      vendor_id: z.string(),
      relevance_score: z.number().min(0).max(1),
      why_matched: z.string(),
    })
  ),
  suggestion: z.string().nullable(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.queryText?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "queryText is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-vendor-memory",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 800,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input.queryText, input.vendors),
        },
      ],
    },
    ctx
  );

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  let parsed: Output;
  try {
    parsed = outputSchema.parse(parseJsonResponse(result.data)) as Output;
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

  // Hallucination guard: every returned vendor_id must exist in input vendors
  const inputIds = new Set(input.vendors.map((v) => v.id));
  const fabricated = parsed.matches.filter((m) => !inputIds.has(m.vendor_id));
  if (fabricated.length > 0) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: `Hallucination guard: vendor_ids not in input: ${fabricated.map((f) => f.vendor_id).join(", ")}`,
      },
    };
  }

  return {
    ok: true,
    data: parsed,
    usage: result.usage,
  };
};
