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
  kid: { name: "Leo", birth_date: "2022-03-15", current_age_months: 26 },
  milestone_text: "Leo said his first two-word sentence 'more milk'",
  recent_milestones: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-kid-milestone", () => {
  it("parses a typical milestone correctly", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        milestone_type: "language_speech",
        normalized_description: "First two-word sentence — 'more milk'",
        age_appropriate: true,
        related_milestones_to_watch_for: ["3-word sentences", "Names people"],
        suggested_celebration: "Write it down with the date!",
        requires_pediatrician_followup: false,
        followup_reason: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 120, costCents: 0.012 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.milestone_type).toBe("language_speech");
    expect(result.data?.requires_pediatrician_followup).toBe(false);
    expect(result.data?.followup_reason).toBeNull();
  });

  it("safety test: losing words input triggers requires_pediatrician_followup: true", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        milestone_type: "language_speech",
        normalized_description: "Appearing to lose words previously used",
        age_appropriate: false,
        related_milestones_to_watch_for: ["Consistent word use", "Eye contact"],
        suggested_celebration: null,
        requires_pediatrician_followup: true,
        followup_reason: "Loss of previously acquired language warrants prompt pediatrician evaluation. This is not a diagnosis.",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 150, costCents: 0.015 },
    });

    const result = await run(
      { ...baseInput, milestone_text: "Leo seems to be losing words he used to say" },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.requires_pediatrician_followup).toBe(true);
    expect(result.data?.followup_reason).toBeTruthy();
    expect(result.data?.followup_reason).toContain("pediatrician");
  });

  it("normalizes unknown milestone_type to general", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        milestone_type: "made_up_type",
        normalized_description: "Some observation",
        age_appropriate: true,
        related_milestones_to_watch_for: [],
        suggested_celebration: null,
        requires_pediatrician_followup: false,
        followup_reason: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 60, costCents: 0.006 },
    });

    const result = await run(baseInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.milestone_type).toBe("general");
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

  it("returns invalid_input for empty milestone_text", async () => {
    const result = await run({ ...baseInput, milestone_text: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("handles milestone with recent history context", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        milestone_type: "motor_fine",
        normalized_description: "Stacked 4 blocks",
        age_appropriate: true,
        related_milestones_to_watch_for: ["Stacks 8 blocks", "Turns pages in book"],
        suggested_celebration: "Great fine motor development!",
        requires_pediatrician_followup: false,
        followup_reason: null,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 250, outputTokens: 100, costCents: 0.01 },
    });

    const result = await run(
      {
        ...baseInput,
        milestone_text: "Stacked 4 blocks without help",
        recent_milestones: [
          { logged_at: "2024-03-01T00:00:00Z", milestone_type: "motor_fine", notes: "Drew a circle" },
        ],
      },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.milestone_type).toBe("motor_fine");
  });
});
