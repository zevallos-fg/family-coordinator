import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  kid: {
    name: string;
    age: number;
    food_favorites: string[];
    food_aversions: string[];
  };
  party_context: "hosting" | "attending";
  host_name?: string;
  party_date: string;
  prior_gifts_given: Array<{ recipient: string; gift: string; date: string; price_usd: number }>;
  prior_gifts_received: Array<{ from: string; gift: string; date: string }>;
}

export interface GiftSuggestion {
  idea: string;
  price_range_usd: string;
  why: string;
  age_appropriate: boolean;
}

export interface ReciprocityCheck {
  parties_attended: number;
  parties_hosted: number;
  observation: string;
}

export interface Output {
  gift_suggestions: GiftSuggestion[];
  etiquette_note: string | null;
  reciprocity_check: ReciprocityCheck | null;
}

const outputSchema = z.object({
  gift_suggestions: z.array(
    z.object({
      idea: z.string(),
      price_range_usd: z.string(),
      why: z.string(),
      age_appropriate: z.boolean(),
    })
  ),
  etiquette_note: z.string().nullable(),
  reciprocity_check: z
    .object({
      parties_attended: z.number().int(),
      parties_hosted: z.number().int(),
      observation: z.string(),
    })
    .nullable(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.kid.name) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "kid.name is required" },
    };
  }

  if (!input.party_date) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "party_date is required" },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-birthday-social",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 800,
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

  // Hallucination guard: all gift suggestions should have realistic USD prices
  // Check that price_range_usd contains a $ sign
  const invalidPrices = parsed.gift_suggestions.filter(
    (g) => !g.price_range_usd.includes("$")
  );
  if (invalidPrices.length > 0) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: `Hallucination guard: price_range_usd missing $ sign: ${invalidPrices.map((g) => g.price_range_usd).join(", ")}`,
      },
    };
  }

  return {
    ok: true,
    data: parsed as Output,
    usage: result.usage,
  };
};
