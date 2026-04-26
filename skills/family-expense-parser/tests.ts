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

const familyMembers = [
  { user_id: "a0000000-0000-4000-8000-000000000001", name: "Fernando" },
  { user_id: "a0000000-0000-4000-8000-000000000002", name: "Yenny" },
];

const baseInput = {
  text: "spent $45.99 at Publix today",
  captured_at: "2026-04-25",
  captured_by_user_id: "a0000000-0000-4000-8000-000000000001",
  family_member_user_ids: familyMembers,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-expense-parser", () => {
  it("parses a simple expense with amount and merchant", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        expense: {
          amount_cents: 4599,
          category: "Groceries",
          merchant: "Publix",
          purchased_at: "2026-04-25",
          paid_by_user_id: "a0000000-0000-4000-8000-000000000001",
          kid_specific: false,
          kid_name: null,
          notes: null,
        },
        reimbursement_needed: false,
        reasoning: "Amount $45.99 found, Publix identified",
        confidence: 0.93,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 120, costCents: 0.012 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.expense?.amount_cents).toBe(4599);
    expect(result.data?.expense?.merchant).toBe("Publix");
    expect(result.data?.reimbursement_needed).toBe(false);
  });

  it("returns null expense for non-expense text", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        expense: null,
        reimbursement_needed: false,
        reasoning: "No expense found in text",
        confidence: 0.0,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 40, costCents: 0.004 },
    });

    const result = await run({ ...baseInput, text: "spent some money today" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.expense).toBeNull();
    expect(result.data?.confidence).toBe(0.0);
  });

  it("detects kid-specific expense", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        expense: {
          amount_cents: 12000,
          category: "Activities",
          merchant: null,
          purchased_at: "2026-04-25",
          paid_by_user_id: null,
          kid_specific: true,
          kid_name: "Leo",
          notes: "Soccer cleats",
        },
        reimbursement_needed: false,
        reasoning: "Leo's cleats, $120",
        confidence: 0.88,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 120, costCents: 0.012 },
    });

    const result = await run(
      { ...baseInput, text: "paid $120 for Leo's soccer cleats" },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.expense?.kid_specific).toBe(true);
    expect(result.data?.expense?.kid_name).toBe("Leo");
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

  it("hallucination guard catches fabricated amount not in text", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        expense: {
          amount_cents: 99999, // $999.99 — not in the text "spent $45.99 at Publix"
          category: "Groceries",
          merchant: "Publix",
          purchased_at: "2026-04-25",
          paid_by_user_id: null,
          kid_specific: false,
          kid_name: null,
          notes: null,
        },
        reimbursement_needed: false,
        reasoning: "Fabricated amount",
        confidence: 0.9,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 60, costCents: 0.006 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
    expect(result.error?.message).toContain("Hallucination guard");
  });

  it("returns invalid_input for empty text", async () => {
    const result = await run({ ...baseInput, text: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });
});
