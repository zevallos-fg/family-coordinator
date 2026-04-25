import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";
import type { Input, Output } from "./index";

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

const CTX: SkillContext = {
  familyId: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};

// UUIDs must satisfy Zod 4's strict format: variant nibble in [89abAB]
const ING_ID_1 = "11111111-1111-4111-a111-111111111111";
const ING_ID_2 = "22222222-2222-4222-b222-222222222222";

const CANDIDATES = [
  { id: ING_ID_1, canonical_name: "green onion" },
  { id: ING_ID_2, canonical_name: "leek" },
];

describe("family-ingredient-resolver skill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns invalid_input when cleanedName is empty", async () => {
    const input: Input = { cleanedName: "", candidates: CANDIDATES };
    const result = await run(input, CTX);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("returns invalid_input when cleanedName is whitespace-only", async () => {
    const input: Input = { cleanedName: "   ", candidates: CANDIDATES };
    const result = await run(input, CTX);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("returns unmatched without calling skill when candidates is empty", async () => {
    const input: Input = { cleanedName: "scallion", candidates: [] };
    const result = await run(input, CTX);
    expect(result.ok).toBe(true);
    expect(result.data?.resolvedId).toBeNull();
    expect(result.data?.confidence).toBe("unmatched");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("parses valid haiku-matched output from skill", async () => {
    const resolvedId = ING_ID_1;
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({ resolvedId, confidence: "haiku" }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 50, outputTokens: 20, costCents: 0.04 },
    });

    const input: Input = { cleanedName: "scallion", candidates: CANDIDATES };
    const result = await run(input, CTX);

    expect(result.ok).toBe(true);
    expect(result.data?.resolvedId).toBe(resolvedId);
    expect(result.data?.confidence).toBe("haiku");
    expect(mockCallSkill).toHaveBeenCalledOnce();
  });

  it("parses unmatched output when skill finds no match", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({ resolvedId: null, confidence: "unmatched" }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 50, outputTokens: 20, costCents: 0.04 },
    });

    const input: Input = { cleanedName: "zaatar powder", candidates: CANDIDATES };
    const result = await run(input, CTX);

    expect(result.ok).toBe(true);
    expect(result.data?.resolvedId).toBeNull();
    expect(result.data?.confidence).toBe("unmatched");
  });

  it("returns parse_error when skill returns malformed JSON", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: "not valid json {{",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 50, outputTokens: 5, costCents: 0.01 },
    });

    const input: Input = { cleanedName: "scallion", candidates: CANDIDATES };
    const result = await run(input, CTX);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("propagates upstream error when callSkill returns ok:false", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: false,
      error: { code: "budget_exceeded", message: "Monthly cap hit" },
    });

    const input: Input = { cleanedName: "scallion", candidates: CANDIDATES };
    const result = await run(input, CTX);

    expect(result.ok).toBe(false);
  });
});

// ── Fixture data (for integration tests / manual runs) ───────────────────────
export const SAMPLE_INPUT: Input = {
  cleanedName: "scallion",
  candidates: [
    { id: ING_ID_1, canonical_name: "green onion" },
    { id: ING_ID_2, canonical_name: "leek" },
  ],
};

export const EXPECTED_OUTPUT: Partial<Output> = {
  confidence: "haiku",
};
