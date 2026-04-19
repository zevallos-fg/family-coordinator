import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  imageBase64: string;
  imageMimeType: "image/jpeg" | "image/png" | "image/webp";
  knownStores: Array<{ id: string; name: string }>;
}

export interface Output {
  storeId: string | null;
  storeName: string | null;
  receiptDate: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number;
    category: string | null;
  }>;
  subtotal: number | null;
  tax: number | null;
  total: number;
}

const itemSchema = z.object({
  name: z.string(),
  quantity: z.number().default(1),
  unitPrice: z.number().nullable(),
  totalPrice: z.number(),
  category: z.string().nullable(),
});

const outputSchema = z.object({
  storeId: z.string().nullable(),
  storeName: z.string().nullable(),
  receiptDate: z.string().nullable(),
  items: z.array(itemSchema),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number(),
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

  const result = await callSkill<string>(
    {
      skillName: "family-receipt-parser",
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
            { type: "text", text: buildUserPrompt(input.knownStores) },
          ],
        },
      ],
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
        message:
          err instanceof Error
            ? `Response did not match expected shape: ${err.message}`
            : "Response parse failed",
      },
    };
  }
};
