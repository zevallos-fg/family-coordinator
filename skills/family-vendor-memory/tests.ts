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

const vendors = [
  {
    id: "c1111111-1111-4111-8111-111111111111",
    name: "Cool Air Services",
    category: "HVAC",
    last_used_at: "2026-03-01",
    notes: "reliable",
    services: ["AC repair", "maintenance"],
  },
  {
    id: "c2222222-2222-4222-8222-222222222222",
    name: "Reliable Plumbing Co",
    category: "Plumbing",
    last_used_at: "2025-12-15",
    notes: "fast response",
    services: ["leak repair", "pipe work"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-vendor-memory", () => {
  it("parses valid output with correct vendor match", async () => {
    const mockJson = JSON.stringify({
      matches: [
        {
          vendor_id: "c1111111-1111-4111-8111-111111111111",
          relevance_score: 0.95,
          why_matched: "Exact service match: AC repair",
        },
      ],
      suggestion: "Cool Air Services handled AC repair — call them again.",
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 80, costCents: 0.01 },
    });

    const result = await run({ queryText: "AC repair", vendors }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches).toHaveLength(1);
    expect(result.data?.matches[0].vendor_id).toBe("c1111111-1111-4111-8111-111111111111");
    expect(result.data?.matches[0].relevance_score).toBe(0.95);
    expect(result.data?.suggestion).toBeTruthy();
  });

  it("handles empty vendors array", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ matches: [], suggestion: null }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run({ queryText: "AC repair", vendors: [] }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches).toHaveLength(0);
    expect(result.data?.suggestion).toBeNull();
  });

  it("handles vendors missing services array", async () => {
    const vendorsNoServices = [
      {
        id: "c3333333-3333-4333-8333-333333333333",
        name: "Generic Services",
        category: "Miscellaneous",
        last_used_at: null,
        notes: null,
        services: [],
      },
    ];

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        matches: [
          {
            vendor_id: "c3333333-3333-4333-8333-333333333333",
            relevance_score: 0.4,
            why_matched: "Category match",
          },
        ],
        suggestion: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 40, costCents: 0.005 },
    });

    const result = await run({ queryText: "misc work", vendors: vendorsNoServices }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.matches[0].vendor_id).toBe("c3333333-3333-4333-8333-333333333333");
  });

  it("returns parse_error when model response is malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not valid json at all",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run({ queryText: "plumber", vendors }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("guards against fabricated vendor_id not in input", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        matches: [
          {
            vendor_id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
            relevance_score: 0.9,
            why_matched: "Fabricated match",
          },
        ],
        suggestion: "Use this made-up vendor",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 40, costCents: 0.005 },
    });

    const result = await run({ queryText: "plumber", vendors }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
    expect(result.error?.message).toContain("Hallucination guard");
  });

  it("returns invalid_input on empty queryText", async () => {
    const result = await run({ queryText: "", vendors }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });
});
