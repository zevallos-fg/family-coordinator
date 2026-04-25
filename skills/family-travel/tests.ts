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
  destination: "Miami Beach",
  start_date: "2026-07-04",
  end_date: "2026-07-07",
  household: {
    adults: [{ name: "Fernando" }, { name: "Yenny" }],
    kids: [{ name: "Leo", age_years: 5 }],
  },
  notes: "beach vacation",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-travel", () => {
  it("parses packing list and prep tasks for beach trip with kid", async () => {
    const mockJson = JSON.stringify({
      packing_list: [
        { item: "Sunscreen", owner: "shared", category: "Health & Safety", quantity: 2 },
        { item: "Swim trunks", owner: "Fernando", category: "Clothing", quantity: null },
        { item: "Floaties", owner: "kid_Leo", category: "Beach & Water", quantity: 1 },
      ],
      prep_tasks: [
        { task: "Pack beach bag", days_before_departure: 1 },
        { task: "Reserve parking", days_before_departure: 7 },
      ],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.packing_list).toHaveLength(3);
    expect(result.data?.prep_tasks).toHaveLength(2);
    expect(result.data?.packing_list[2].owner).toBe("kid_Leo");
  });

  it("handles empty kids array for adult-only trip", async () => {
    const adultOnlyInput = {
      destination: "Austin TX",
      start_date: "2026-03-15",
      end_date: "2026-03-17",
      household: { adults: [{ name: "Yenny" }], kids: [] },
    };

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        packing_list: [
          { item: "Laptop", owner: "Yenny", category: "Electronics", quantity: null },
        ],
        prep_tasks: [{ task: "Confirm hotel", days_before_departure: 7 }],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 100, costCents: 0.01 },
    });

    const result = await run(adultOnlyInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.packing_list[0].owner).toBe("Yenny");
  });

  it("returns items for international trip with documents category", async () => {
    const intlInput = {
      destination: "London UK",
      start_date: "2026-06-01",
      end_date: "2026-06-10",
      household: { adults: [{ name: "Fernando" }], kids: [] },
    };

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        packing_list: [
          { item: "Passport", owner: "Fernando", category: "Documents & Money", quantity: null },
          { item: "UK adapter", owner: "Fernando", category: "Electronics", quantity: 1 },
        ],
        prep_tasks: [
          { task: "Check passport expiry", days_before_departure: 30 },
          { task: "Notify bank", days_before_departure: 7 },
        ],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 120, costCents: 0.012 },
    });

    const result = await run(intlInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.packing_list.some((p) => p.category === "Documents & Money")).toBe(true);
    expect(result.data?.prep_tasks.some((t) => t.days_before_departure >= 14)).toBe(true);
  });

  it("returns parse_error for malformed JSON response", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("hallucination guard catches fabricated owner names", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        packing_list: [
          { item: "Toothbrush", owner: "InventedPerson", category: "Toiletries", quantity: null },
        ],
        prep_tasks: [],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 50, costCents: 0.005 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
    expect(result.error?.message).toContain("Hallucination guard");
    expect(result.error?.message).toContain("InventedPerson");
  });

  it("returns invalid_input error for missing destination", async () => {
    const result = await run(
      { ...baseInput, destination: "" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });
});
