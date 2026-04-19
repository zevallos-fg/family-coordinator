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
  familyId: "a0000000-0000-4000-8000-000000000001",
  userId: "a0000000-0000-4000-8000-000000000002",
};

const stores = [
  { id: "b1111111-1111-4111-8111-111111111111", name: "Publix" },
  { id: "b2222222-2222-4222-8222-222222222222", name: "Costco" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-grocery-parser", () => {
  it("parses simple grocery list with quantity and store", async () => {
    const mockJson = JSON.stringify({
      items: [
        { name: "Bananas", quantity: null, unit: null, storeId: null, notes: null },
        {
          name: "Milk",
          quantity: 2,
          unit: "gallon",
          storeId: "b2222222-2222-4222-8222-222222222222",
          notes: null,
        },
        {
          name: "Paper Towels",
          quantity: null,
          unit: null,
          storeId: "b2222222-2222-4222-8222-222222222222",
          notes: null,
        },
      ],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 200,
        outputTokens: 80,
        costCents: 0.01,
      },
    });

    const result = await run(
      { text: "need bananas, 2 gallons of milk, and paper towels at Costco", stores },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.items).toHaveLength(3);
    expect(result.data?.items[1].quantity).toBe(2);
    expect(result.data?.items[1].unit).toBe("gallon");
    expect(result.data?.items[2].storeId).toBe("b2222222-2222-4222-8222-222222222222");
  });

  it("splits compound items correctly", async () => {
    const mockJson = JSON.stringify({
      items: [
        { name: "Oregano", quantity: null, unit: null, storeId: null, notes: null },
        { name: "Chili Powder", quantity: null, unit: null, storeId: null, notes: null },
      ],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 150,
        outputTokens: 60,
        costCents: 0.008,
      },
    });

    const result = await run({ text: "add oregano and chili powder to the list", stores }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.items[0].name).toBe("Oregano");
    expect(result.data?.items[1].name).toBe("Chili Powder");
  });

  it("returns empty items array for non-grocery text", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ items: [] }),
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 100,
        outputTokens: 20,
        costCents: 0.003,
      },
    });

    const result = await run({ text: "call the dentist tomorrow", stores }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.items).toHaveLength(0);
  });

  it("handles items with notes", async () => {
    const mockJson = JSON.stringify({
      items: [
        {
          name: "Cereal",
          quantity: null,
          unit: null,
          storeId: null,
          notes: "Leo's favorite",
        },
      ],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 150,
        outputTokens: 50,
        costCents: 0.006,
      },
    });

    const result = await run({ text: "remind me to buy Leo's favorite cereal", stores }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.items[0].notes).toBe("Leo's favorite");
  });

  it("returns invalid_input error on empty text", async () => {
    const result = await run({ text: "", stores }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("returns parse_error when model response is malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not valid json at all",
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 100,
        outputTokens: 20,
        costCents: 0.003,
      },
    });

    const result = await run({ text: "buy milk", stores }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("propagates budget_exceeded without wrapping", async () => {
    mockCallSkill.mockResolvedValue({
      ok: false,
      error: { code: "budget_exceeded", message: "Monthly cap reached" },
    });

    const result = await run({ text: "buy milk", stores }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("budget_exceeded");
  });
});
