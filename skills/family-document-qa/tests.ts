import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";

vi.mock("server-only", () => ({}));

vi.mock("../_lib/runner", () => ({
  callSkill: vi.fn(),
}));

vi.mock("posthog-node", () => {
  class PostHog {
    capture = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);
  }
  return { PostHog };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

import { callSkill } from "../_lib/runner";
import { run } from "./index";

const mockCallSkill = vi.mocked(callSkill);

const ctx: SkillContext = {
  familyId: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  userId: "a0000000-0000-4000-8000-000000000002",
};

const corpus = [
  {
    id: "d1111111-1111-4111-8111-111111111111",
    title: "BCBS Health Insurance Card",
    doc_type: "insurance_card",
    ocr_text: "BLUE CROSS BLUE SHIELD Member: Fernando Zevallos Deductible: $1,500 Copay: $30",
    tags: ["insurance", "health"],
    summary: "Health insurance card for Fernando",
  },
  {
    id: "d2222222-2222-4222-8222-222222222222",
    title: "Leo Medical Record 2026",
    doc_type: "medical_record",
    ocr_text: "Patient: Leo Zevallos Weight: 42 lbs Height: 41 in Well child visit March 2026",
    tags: ["medical", "leo"],
    summary: "Leo well-child visit",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-document-qa", () => {
  it("returns matching document with verbatim passage", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        matches: [
          {
            document_id: "d1111111-1111-4111-8111-111111111111",
            relevance_score: 0.95,
            relevant_passage: "Deductible: $1,500 Copay: $30",
            confidence: 0.92,
          },
        ],
        no_match_reason: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 150, costCents: 0.015 },
    });

    const result = await run({ query: "What is my deductible?", document_corpus: corpus }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches).toHaveLength(1);
    expect(result.data?.matches[0].relevant_passage).toBe("Deductible: $1,500 Copay: $30");
  });

  it("returns empty matches for no-match query", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        matches: [],
        no_match_reason: "No car insurance documents found.",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 60, costCents: 0.006 },
    });

    const result = await run({ query: "What is my car insurance policy number?", document_corpus: corpus }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches).toHaveLength(0);
    expect(result.data?.no_match_reason).toBeTruthy();
  });

  it("filters out fabricated passages not in ocr_text", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        matches: [
          {
            document_id: "d1111111-1111-4111-8111-111111111111",
            relevance_score: 0.85,
            relevant_passage: "This text was fabricated and does not appear in the document",
            confidence: 0.80,
          },
        ],
        no_match_reason: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 100, costCents: 0.01 },
    });

    const result = await run({ query: "deductible", document_corpus: corpus }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Fabricated passage filtered out
    expect(result.data?.matches).toHaveLength(0);
  });

  it("filters out fabricated document_ids not in corpus", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        matches: [
          {
            document_id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
            relevance_score: 0.9,
            relevant_passage: "Some text",
            confidence: 0.85,
          },
        ],
        no_match_reason: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 100, costCents: 0.01 },
    });

    const result = await run({ query: "insurance", document_corpus: corpus }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches).toHaveLength(0);
  });

  it("returns empty matches immediately for empty corpus", async () => {
    const result = await run({ query: "anything", document_corpus: [] }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches).toHaveLength(0);
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("returns parse_error for malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run({ query: "insurance", document_corpus: corpus }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });
});
