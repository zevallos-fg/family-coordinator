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

describe("family-caregiver-recap", () => {
  it("parses a standard caregiver recap", async () => {
    const mockJson = JSON.stringify({
      summary: "Leo had a great day. He napped for 2 hours and ate all his lunch.",
      structuredData: {
        sleep: { napStart: "12:30", napEnd: "14:30", durationMin: 120, quality: "good" },
        meals: [{ time: null, description: "lunch", amountEaten: "all" }],
        moodEvents: [],
        health: { symptoms: [], medications: [] },
        other: [],
      },
      parentsShouldKnow: [],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 250, outputTokens: 120, costCents: 0.02 },
    });

    const result = await run(
      {
        kidName: "Leo",
        shiftTimes: { startAt: "2026-04-19T08:00:00", endAt: "2026-04-19T17:00:00" },
        caregiverText: "Leo napped from 12:30 to 2:30, ate all his lunch, was happy all day",
      },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.summary).toBeTruthy();
    expect(result.data?.structuredData.sleep?.durationMin).toBe(120);
    expect(result.data?.parentsShouldKnow).toEqual([]);
  });

  it("returns invalid_input when caregiverText is empty", async () => {
    const result = await run(
      { kidName: "Leo", shiftTimes: { startAt: "2026-04-19T08:00:00", endAt: "2026-04-19T17:00:00" }, caregiverText: "" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("extracts urgent parentsShouldKnow items", async () => {
    const mockJson = JSON.stringify({
      summary: "Tough day. Leo fell and bumped his head.",
      structuredData: { meals: [], moodEvents: [], health: { symptoms: ["bump on head"], medications: [] }, other: [] },
      parentsShouldKnow: ["Leo fell and bumped his head around 3pm, seemed fine after but worth checking"],
    });

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: mockJson,
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 100, costCents: 0.015 },
    });

    const result = await run(
      { kidName: "Leo", shiftTimes: { startAt: "2026-04-19T08:00:00", endAt: "2026-04-19T17:00:00" }, caregiverText: "Leo fell and bumped his head at 3pm" },
      ctx
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.parentsShouldKnow.length).toBeGreaterThan(0);
  });

  it("returns parse_error on malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "bad json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.005 },
    });

    const result = await run(
      { kidName: "Leo", shiftTimes: { startAt: "2026-04-19T08:00:00", endAt: "2026-04-19T17:00:00" }, caregiverText: "good day" },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });
});
