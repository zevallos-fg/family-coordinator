import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";

vi.mock("server-only", () => ({}));
vi.mock("../_lib/runner", () => ({ callSkill: vi.fn() }));
vi.mock("posthog-node", () => {
  class PostHog {
    capture = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);
  }
  return { PostHog };
});
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));

import { callSkill } from "../_lib/runner";
import { run } from "./index";

const mockCallSkill = vi.mocked(callSkill);

const ctx: SkillContext = {
  familyId: "a0000000-0000-4000-8000-000000000001",
  userId: "a0000000-0000-4000-8000-000000000002",
};

const baseInput = {
  caregiver: { name: "Rosa", role: "grandparent" },
  kids: [
    {
      name: "Leo",
      birthDate: "2023-01-15",
      notes: "• Really into dinosaurs\n• Sleeping well",
      foodFavorites: ["blueberries", "mac and cheese"],
      foodAversions: ["broccoli"],
    },
  ],
  shift: { startAt: "2026-04-19T08:00:00", endAt: "2026-04-19T17:00:00" },
  openTasks: [],
};

beforeEach(() => vi.clearAllMocks());

describe("family-caregiver-brief", () => {
  it("returns content for a valid brief request", async () => {
    const mockJson = JSON.stringify({
      content:
        "Good morning, Rosa! 👋\n\n**Today: Sunday, April 19 · 8:00 AM – 5:00 PM**\n\n---\n\n## Leo's world right now\n\n- **Loves:** blueberries, mac and cheese\n\n---\n\n*Lots of love, Fernando & Yenny* 💛",
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 400, outputTokens: 200, costCents: 0.035 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.content).toContain("Rosa");
    expect(result.data?.content.length).toBeGreaterThan(50);
  });

  it("returns invalid_input when caregiver name is empty", async () => {
    const result = await run(
      { ...baseInput, caregiver: { name: "", role: "grandparent" } },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("handles empty kids array gracefully", async () => {
    const mockJson = JSON.stringify({
      content: "Good morning, Rosa!\n\nToday is April 19.\n\n*Love, Fernando & Yenny*",
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 80, costCents: 0.02 },
    });

    const result = await run({ ...baseInput, kids: [] }, ctx);
    expect(result.ok).toBe(true);
  });

  it("returns parse_error on malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.005 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("propagates budget_exceeded", async () => {
    mockCallSkill.mockResolvedValue({
      ok: false,
      error: { code: "budget_exceeded", message: "Monthly cap reached" },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("budget_exceeded");
  });
});
