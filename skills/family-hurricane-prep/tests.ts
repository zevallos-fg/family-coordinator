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
  family_id: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  current_date: "2026-04-15",
  location: "miami_fl" as const,
  household: { adults: 2, kids: 1, home_type: "single_family" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-hurricane-prep", () => {
  it("returns pre_season phase for April date", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        season_phase: "pre_season",
        checklist_items: [
          { text: "Test generator", category: "Generator & Power", priority: "high", due_by_offset_days: 14 },
          { text: "Stock water supply", category: "Supplies & Food", priority: "high", due_by_offset_days: 21 },
        ],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 150, costCents: 0.015 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.season_phase).toBe("pre_season");
    expect(result.data?.checklist_items.length).toBeGreaterThan(0);
  });

  it("returns post_season phase for December date", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        season_phase: "post_season",
        checklist_items: [
          { text: "Drain and store gas cans", category: "Generator & Power", priority: "medium", due_by_offset_days: 14 },
        ],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 80, costCents: 0.01 },
    });

    const result = await run({ ...baseInput, current_date: "2026-12-01" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.season_phase).toBe("post_season");
  });

  it("catches named storm injection in checklist items", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        season_phase: "active_season",
        checklist_items: [
          { text: "Prepare for Hurricane Andrew this season", category: "Home Safety", priority: "high", due_by_offset_days: 0 },
          { text: "Stock water supply", category: "Supplies & Food", priority: "high", due_by_offset_days: 7 },
        ],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 100, costCents: 0.01 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
    expect(result.error?.message).toContain("Hallucination guard");
    expect(result.error?.message).toContain("named storm");
  });

  it("catches cross-region contamination (snow)", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        season_phase: "pre_season",
        checklist_items: [
          { text: "Buy snow shovel for winter storms", category: "Home Safety", priority: "low", due_by_offset_days: 90 },
        ],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 80, costCents: 0.01 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
    expect(result.error?.message).toContain("non-Miami hazard");
  });

  it("returns parse_error for malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "definitely not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("returns invalid_input when current_date is missing", async () => {
    const result = await run({ ...baseInput, current_date: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("accepts valid active_season output with no hallucinations", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        season_phase: "active_season",
        checklist_items: [
          { text: "Keep car fuel above half-tank", category: "Vehicle & Fuel", priority: "high", due_by_offset_days: 0 },
          { text: "Confirm evacuation zone", category: "Family Planning", priority: "critical", due_by_offset_days: 0 },
        ],
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 120, costCents: 0.012 },
    });

    const result = await run({ ...baseInput, current_date: "2026-08-15" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.season_phase).toBe("active_season");
    expect(result.data?.checklist_items).toHaveLength(2);
  });
});
