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

beforeEach(() => vi.clearAllMocks());

describe("family-kid-state", () => {
  it("returns updated state for valid observation", async () => {
    const mockJson = JSON.stringify({
      updatedNotes: "• Really into dinosaurs this week\n• Sleeping well lately",
      updatedFoodFavorites: ["blueberries", "mac and cheese"],
      updatedFoodAversions: ["broccoli"],
      summary: "Added dinosaur interest and confirmed blueberries as a favorite.",
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 80, costCents: 0.01 },
    });

    const result = await run(
      {
        kidName: "Leo",
        currentNotes: "• Likes trucks",
        currentFoodFavorites: ["blueberries"],
        currentFoodAversions: ["broccoli"],
        newObservation: "Leo is really into dinosaurs this week and loves mac and cheese now",
        observationDate: "2026-04-19",
      },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.updatedFoodFavorites).toContain("mac and cheese");
    expect(result.data?.summary).toBeTruthy();
  });

  it("returns invalid_input when kidName is empty", async () => {
    const result = await run(
      { kidName: "", currentNotes: "", currentFoodFavorites: [], currentFoodAversions: [], newObservation: "test", observationDate: "2026-04-19" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("returns invalid_input when newObservation is empty", async () => {
    const result = await run(
      { kidName: "Leo", currentNotes: "", currentFoodFavorites: [], currentFoodAversions: [], newObservation: "  ", observationDate: "2026-04-19" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("returns parse_error on malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.005 },
    });

    const result = await run(
      { kidName: "Leo", currentNotes: "", currentFoodFavorites: [], currentFoodAversions: [], newObservation: "Leo napped well", observationDate: "2026-04-19" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("propagates budget_exceeded from runner", async () => {
    mockCallSkill.mockResolvedValue({
      ok: false,
      error: { code: "budget_exceeded", message: "Monthly cap reached" },
    });

    const result = await run(
      { kidName: "Leo", currentNotes: "", currentFoodFavorites: [], currentFoodAversions: [], newObservation: "test", observationDate: "2026-04-19" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("budget_exceeded");
  });
});
