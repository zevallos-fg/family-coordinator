import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";

// Mock server-only so it doesn't throw in test env
vi.mock("server-only", () => ({}));

// Mock the runner so no real Supabase/Worker calls happen
vi.mock("../_lib/runner", () => ({
  callSkill: vi.fn(),
}));

// Mock posthog-node
vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn(),
  })),
}));

// Mock next/headers (required by server supabase client, pulled in transitively)
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

// UUIDs must be valid RFC 4122 (version 4, variant 8-b) for Zod v4
const categories = [
  { id: "a1111111-1111-4111-8111-111111111111", name: "Groceries" },
  { id: "a2222222-2222-4222-8222-222222222222", name: "Kids" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-capture-router", () => {
  it("returns parsed output for valid grocery input", async () => {
    const mockJson = JSON.stringify({
      categoryId: "a1111111-1111-4111-8111-111111111111",
      isGrocery: true,
      groceryItems: ["oregano", "chili powder", "paper towels"],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 200,
        outputTokens: 50,
        costCents: 0.01,
      },
    });

    const result = await run(
      { text: "need to pick up oregano, chili powder, and paper towels", categories },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.isGrocery).toBe(true);
    expect(result.data?.groceryItems).toEqual([
      "oregano",
      "chili powder",
      "paper towels",
    ]);
    expect(result.data?.categoryId).toBe("a1111111-1111-4111-8111-111111111111");
  });

  it("returns invalid_input error on empty text", async () => {
    const result = await run({ text: "", categories }, ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("returns invalid_input error on whitespace-only text", async () => {
    const result = await run({ text: "   ", categories }, ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("returns parse_error when model response is malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not valid json at all",
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 100,
        outputTokens: 20,
        costCents: 0.005,
      },
    });

    const result = await run(
      { text: "buy milk", categories },
      ctx
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("returns parse_error when model response has wrong shape", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ wrong: "shape" }),
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 100,
        outputTokens: 20,
        costCents: 0.005,
      },
    });

    const result = await run(
      { text: "buy milk", categories },
      ctx
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("propagates runner errors (e.g. budget_exceeded) without wrapping", async () => {
    mockCallSkill.mockResolvedValue({
      ok: false,
      error: { code: "budget_exceeded", message: "Monthly cap reached" },
    });

    const result = await run({ text: "buy milk", categories }, ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("budget_exceeded");
  });
});
