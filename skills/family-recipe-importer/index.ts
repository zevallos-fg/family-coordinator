import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  IMAGE_SYSTEM_PROMPT,
  buildImageUserPrompt,
} from "./prompt";

/**
 * Input is a discriminated union — either URL mode (fetch HTML, send text)
 * or IMAGE mode (send photo bytes to a vision-enabled model).
 *
 * URL mode is the original flow. IMAGE mode sidesteps bot-detection on
 * Cloudflare-protected recipe sites and handles cookbook pages and
 * handwritten cards.
 */
export type Input =
  | {
      mode: "url";
      url: string;
      html: string;
    }
  | {
      mode: "image";
      imageBase64: string;
      imageMimeType: "image/jpeg" | "image/png" | "image/webp";
    };

export interface Output {
  name: string;
  servings: number;
  totalTimeMin: number | null;
  instructions: string[];
  ingredients: Array<{
    canonicalName: string;
    quantity: number | null;
    unit: string | null;
    note: string | null;
  }>;
  sourceUrl: string;
}

const ingredientSchema = z.object({
  canonicalName: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
});

const outputSchema = z.object({
  name: z.string().min(1),
  servings: z.number().int().positive().default(4),
  totalTimeMin: z.number().int().positive().nullable(),
  instructions: z.array(z.string().min(1)),
  ingredients: z.array(ingredientSchema),
  sourceUrl: z.string(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (input.mode === "url") {
    if (!input.url?.trim()) {
      return { ok: false, error: { code: "invalid_input", message: "url is required" } };
    }
    if (!input.html?.trim()) {
      return { ok: false, error: { code: "invalid_input", message: "html is required" } };
    }
  } else if (input.mode === "image") {
    if (!input.imageBase64) {
      return { ok: false, error: { code: "invalid_input", message: "imageBase64 is required" } };
    }
    if (!input.imageMimeType) {
      return { ok: false, error: { code: "invalid_input", message: "imageMimeType is required" } };
    }
  } else {
    return { ok: false, error: { code: "invalid_input", message: "unknown input mode" } };
  }

  const callOpts =
    input.mode === "url"
      ? {
          skillName: "family-recipe-importer",
          tier: "haiku" as const,
          system: SYSTEM_PROMPT,
          maxTokens: 1500,
          messages: [
            { role: "user" as const, content: buildUserPrompt(input.html, input.url) },
          ],
        }
      : {
          skillName: "family-recipe-importer",
          tier: "haiku" as const,
          system: IMAGE_SYSTEM_PROMPT,
          maxTokens: 1500,
          messages: [
            {
              role: "user" as const,
              content: [
                {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: input.imageMimeType,
                    data: input.imageBase64,
                  },
                },
                { type: "text" as const, text: buildImageUserPrompt() },
              ],
            },
          ],
        };

  const result = await callSkill<string>(callOpts, ctx);

  if (!result.ok || !result.data) return result as unknown as SkillResult<Output>;

  try {
    const raw = parseJsonResponse<Record<string, unknown>>(result.data);
    if ("error" in raw && raw.error === "no_recipe_found") {
      return {
        ok: false,
        error: {
          code: "parse_error",
          message:
            input.mode === "url"
              ? "The page does not contain a recipe"
              : "The image does not appear to contain a recipe",
        },
      };
    }
    const parsed = outputSchema.parse(raw);
    return { ok: true, data: parsed, usage: result.usage };
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