import { z } from "zod";

import { parseJsonResponse } from "../_lib/parse";
import { callSkill } from "../_lib/runner";
import type { SkillContext, SkillResult, SkillRunner } from "../_lib/types";

import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface DocumentCorpusEntry {
  id: string;
  title: string;
  doc_type: string | null;
  ocr_text: string;
  tags: string[] | null;
  summary: string | null;
}

export interface Input {
  query: string;
  document_corpus: DocumentCorpusEntry[];
}

export interface DocumentMatch {
  document_id: string;
  relevance_score: number;
  relevant_passage: string;
  confidence: number;
}

export interface Output {
  matches: DocumentMatch[];
  no_match_reason: string | null;
}

const outputSchema = z.object({
  matches: z.array(
    z.object({
      document_id: z.string(),
      relevance_score: z.number().min(0).max(1),
      relevant_passage: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
  no_match_reason: z.string().nullable(),
});

export const run: SkillRunner<Input, Output> = async (
  input,
  ctx: SkillContext
): Promise<SkillResult<Output>> => {
  if (!input.query?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "query is required" },
    };
  }

  if (input.document_corpus.length === 0) {
    return {
      ok: true,
      data: {
        matches: [],
        no_match_reason: "No documents in vault to search.",
      },
    };
  }

  const result = await callSkill<string>(
    {
      skillName: "family-document-qa",
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

  // Hallucination guard: every relevant_passage must be a verbatim substring of corresponding ocr_text
  const docMap = new Map(input.document_corpus.map((d) => [d.id, d]));
  const validatedMatches: DocumentMatch[] = [];

  for (const match of parsed.matches) {
    const doc = docMap.get(match.document_id);
    if (!doc) {
      // Skip matches for documents not in corpus (fabricated document_id)
      continue;
    }

    // Verify passage is verbatim substring
    if (!doc.ocr_text.includes(match.relevant_passage)) {
      // Skip fabricated passage rather than failing entirely
      // Log but continue with other matches
      continue;
    }

    validatedMatches.push(match);
  }

  return {
    ok: true,
    data: {
      matches: validatedMatches,
      no_match_reason:
        validatedMatches.length === 0 && parsed.matches.length > 0
          ? "Passages could not be verified against document text."
          : parsed.no_match_reason,
    },
    usage: result.usage,
  };
};
