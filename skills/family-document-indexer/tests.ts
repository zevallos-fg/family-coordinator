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

const baseInput = {
  document_id: "d1111111-1111-4111-8111-111111111111",
  file_url: "https://example.com/doc.pdf",
  family_id: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  mime_type: "application/pdf",
  filename: "insurance_card.pdf",
};

const validOutput = {
  ocr_text: "BLUE CROSS BLUE SHIELD Member: Fernando Zevallos Effective: 01/01/2026 Copay: $30",
  summary: "Health insurance card for Fernando Zevallos.",
  suggested_tags: ["insurance", "health", "2026"],
  suggested_doc_type: "insurance_card",
  detected_dates: ["01/01/2026"],
  detected_amounts: ["$30"],
  detected_parties: ["Blue Cross Blue Shield", "Fernando Zevallos"],
  extraction_confidence: 0.95,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-document-indexer", () => {
  it("parses a valid document extraction", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify(validOutput),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.suggested_doc_type).toBe("insurance_card");
    expect(result.data?.detected_amounts).toContain("$30");
    expect(result.data?.extraction_confidence).toBe(0.95);
  });

  it("filters out fabricated dates not in ocr_text", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        ...validOutput,
        detected_dates: ["01/01/2026", "12/31/2099"], // 12/31/2099 is fabricated
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 12/31/2099 should be filtered — it's not in ocr_text
    expect(result.data?.detected_dates).toContain("01/01/2026");
    expect(result.data?.detected_dates).not.toContain("12/31/2099");
  });

  it("filters out fabricated parties not in ocr_text", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        ...validOutput,
        detected_parties: ["Fernando Zevallos", "Invented Person LLC"],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.detected_parties).toContain("Fernando Zevallos");
    expect(result.data?.detected_parties).not.toContain("Invented Person LLC");
  });

  it("returns parse_error for malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("returns invalid_input for missing document_id", async () => {
    const result = await run({ ...baseInput, document_id: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("handles empty detected arrays correctly", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        ...validOutput,
        detected_dates: [],
        detected_amounts: [],
        detected_parties: [],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 150, costCents: 0.015 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.detected_dates).toHaveLength(0);
    expect(result.data?.detected_amounts).toHaveLength(0);
  });
});
