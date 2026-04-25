import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface Input {
  document_id: string;
  file_url: string;
  family_id: string;
  mime_type: string;
  filename: string;
}

export interface Output {
  ocr_text: string;
  summary: string;
  suggested_tags: string[];
  suggested_doc_type: string;
  detected_dates: string[];
  detected_amounts: string[];
  detected_parties: string[];
  extraction_confidence: number;
}

const outputSchema = z.object({
  ocr_text: z.string(),
  summary: z.string(),
  suggested_tags: z.array(z.string()),
  suggested_doc_type: z.string(),
  detected_dates: z.array(z.string()),
  detected_amounts: z.array(z.string()),
  detected_parties: z.array(z.string()),
  extraction_confidence: z.number().min(0).max(1),
});

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function isSupportedImageType(mime: string): mime is SupportedImageType {
  return SUPPORTED_IMAGE_TYPES.includes(mime as SupportedImageType);
}

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.document_id || !input.file_url) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "document_id and file_url are required" },
    };
  }

  // Build message content — image types get vision, others get text
  const isImage = isSupportedImageType(input.mime_type);

  const messageContent = isImage
    ? [
        { type: "text" as const, text: buildUserPrompt(input) },
        {
          type: "image" as const,
          source: { type: "url" as const, url: input.file_url },
        },
      ]
    : buildUserPrompt(input);

  const result = await callSkill<string>(
    {
      skillName: "family-document-indexer",
      tier: "haiku",
      system: SYSTEM_PROMPT,
      maxTokens: 1500,
      messages: [
        {
          role: "user",
          content: messageContent,
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

  // Hallucination guard: detected_dates/amounts/parties must appear in ocr_text
  const ocrLower = parsed.ocr_text.toLowerCase();

  const fabricatedDates = parsed.detected_dates.filter(
    (d) => !ocrLower.includes(d.toLowerCase())
  );
  const fabricatedAmounts = parsed.detected_amounts.filter(
    (a) => !parsed.ocr_text.includes(a)
  );
  const fabricatedParties = parsed.detected_parties.filter(
    (p) => !ocrLower.includes(p.toLowerCase())
  );

  if (fabricatedDates.length > 0 || fabricatedAmounts.length > 0 || fabricatedParties.length > 0) {
    // Remove fabricated entries rather than failing hard
    return {
      ok: true,
      data: {
        ...parsed,
        detected_dates: parsed.detected_dates.filter((d) => ocrLower.includes(d.toLowerCase())),
        detected_amounts: parsed.detected_amounts.filter((a) => parsed.ocr_text.includes(a)),
        detected_parties: parsed.detected_parties.filter((p) => ocrLower.includes(p.toLowerCase())),
      } as Output,
      usage: result.usage,
    };
  }

  return {
    ok: true,
    data: parsed as Output,
    usage: result.usage,
  };
};
