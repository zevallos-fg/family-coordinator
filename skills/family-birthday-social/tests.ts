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
  kid: { name: "Leo", age: 5, food_favorites: ["dinosaurs"], food_aversions: [] },
  party_context: "attending" as const,
  host_name: "Sofia",
  party_date: "2026-07-20",
  prior_gifts_given: [],
  prior_gifts_received: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-birthday-social", () => {
  it("returns gift suggestions for attending a birthday", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        gift_suggestions: [
          { idea: "Dinosaur figurine set", price_range_usd: "$25–40", why: "Leo loves dinosaurs", age_appropriate: true },
          { idea: "Art supply kit", price_range_usd: "$20–30", why: "Creative play for 5-year-olds", age_appropriate: true },
        ],
        etiquette_note: "Wrap the gift and bring a card.",
        reciprocity_check: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.gift_suggestions).toHaveLength(2);
    expect(result.data?.gift_suggestions[0].age_appropriate).toBe(true);
    expect(result.data?.etiquette_note).toBeTruthy();
  });

  it("returns reciprocity check when prior gift history exists", async () => {
    const inputWithHistory = {
      ...baseInput,
      prior_gifts_given: [{ recipient: "Sofia", gift: "Book set", date: "2025-07-20", price_usd: 25 }],
    };

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        gift_suggestions: [
          { idea: "Puzzle set", price_range_usd: "$25–35", why: "Similar price to last year's gift", age_appropriate: true },
        ],
        etiquette_note: "$25 gift is consistent with prior year.",
        reciprocity_check: { parties_attended: 1, parties_hosted: 0, observation: "Attended 1 of Sofia's parties." },
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(inputWithHistory, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.reciprocity_check).not.toBeNull();
    expect(result.data?.reciprocity_check?.parties_attended).toBe(1);
  });

  it("handles hosting context with no prior history", async () => {
    const hostingInput = { ...baseInput, party_context: "hosting" as const, host_name: undefined };

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        gift_suggestions: [
          { idea: "LEGO DUPLO set", price_range_usd: "$25–35", why: "Classic building toy for 5-year-olds", age_appropriate: true },
        ],
        etiquette_note: null,
        reciprocity_check: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 150, costCents: 0.015 },
    });

    const result = await run(hostingInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.gift_suggestions.length).toBeGreaterThan(0);
    expect(result.data?.etiquette_note).toBeNull();
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

  it("hallucination guard catches invalid price format (missing $)", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        gift_suggestions: [
          { idea: "Some gift", price_range_usd: "twenty to thirty dollars", why: "Good gift", age_appropriate: true },
        ],
        etiquette_note: null,
        reciprocity_check: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 60, costCents: 0.006 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
    expect(result.error?.message).toContain("Hallucination guard");
  });

  it("returns invalid_input for missing kid.name", async () => {
    const result = await run(
      { ...baseInput, kid: { ...baseInput.kid, name: "" } },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });
});
