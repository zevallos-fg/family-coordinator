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
  userId: "a0000000-0000-4000-8000-000000000001",
};

const emptyInput = {
  week_start_date: "2026-04-21",
  family_members: [],
  captures: [],
  schedule_entries: [],
  expenses: [],
  completed_tasks: [],
  open_tasks: [],
  kid_milestones: [],
  upcoming_birthdays: [],
  caregiver_shifts: 0,
  seasonal_items_open: 0,
};

const richInput = {
  week_start_date: "2026-04-21",
  family_members: [
    { name: "Fernando", user_id: "a0000000-0000-4000-8000-000000000001" },
    { name: "Yenny", user_id: "a0000000-0000-4000-8000-000000000002" },
  ],
  captures: [{ text: "Buy milk", created_at: "2026-04-22T10:00:00Z" }],
  schedule_entries: [{ title: "Leo checkup", date: "2026-04-21" }],
  expenses: [{ amount_cents: 4599, merchant: "Publix", category: "Groceries" }],
  completed_tasks: ["Schedule dentist"],
  open_tasks: ["Call plumber"],
  kid_milestones: [{ kid_name: "Leo", type: "language_speech", description: "First two-word sentence" }],
  upcoming_birthdays: [],
  caregiver_shifts: 2,
  seasonal_items_open: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-weekly-digest", () => {
  it("returns all data_present: false for all-empty input", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        summary: "No data recorded this week.",
        sections: [
          { title: "Schedule", body: "No activity this week.", data_present: false },
          { title: "Captures", body: "No activity this week.", data_present: false },
          { title: "Expenses", body: "No activity this week.", data_present: false },
        ],
        blind_spots: [],
        load_attribution: { members: [], observation: "No data available" },
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(emptyInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.sections.every((s) => !s.data_present)).toBe(true);
    expect(result.data?.blind_spots).toHaveLength(0);
  });

  it("returns sections with data for rich input", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        summary: "A busy week with Leo's checkup and grocery run.",
        sections: [
          { title: "Schedule", body: "Leo's checkup completed.", data_present: true },
          { title: "Captures", body: "1 capture logged.", data_present: true },
          { title: "Expenses", body: "$45.99 at Publix.", data_present: true },
        ],
        blind_spots: [
          { category: "tasks", observation: "1 open task pending", suggested_action: "Assign plumber task", related_entity_id: null },
        ],
        load_attribution: {
          members: [
            { name: "Fernando", action_count: 3, mention_count: 2 },
            { name: "Yenny", action_count: 1, mention_count: 1 },
          ],
          observation: "Fernando more active this week",
        },
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 400, outputTokens: 300, costCents: 0.03 },
    });

    const result = await run(richInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.sections.some((s) => s.data_present)).toBe(true);
    expect(result.data?.blind_spots).toHaveLength(1);
    expect(result.data?.load_attribution.members).toHaveLength(2);
  });

  it("filters out fabricated member names from load_attribution", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        summary: "Weekly summary.",
        sections: [
          { title: "Schedule", body: "No activity.", data_present: false },
        ],
        blind_spots: [],
        load_attribution: {
          members: [
            { name: "Fernando", action_count: 2, mention_count: 1 },
            { name: "FabricatedPerson", action_count: 5, mention_count: 3 }, // NOT in input
          ],
          observation: "Fernando and FabricatedPerson active",
        },
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(richInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // FabricatedPerson should be filtered out
    expect(result.data?.load_attribution.members.map((m) => m.name)).not.toContain("FabricatedPerson");
    expect(result.data?.load_attribution.members.map((m) => m.name)).toContain("Fernando");
  });

  it("returns parse_error for malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not json",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 20, costCents: 0.003 },
    });

    const result = await run(emptyInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("returns invalid_input for missing week_start_date", async () => {
    const result = await run({ ...emptyInput, week_start_date: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("handles blind spots with non-null related_entity_ids correctly", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        summary: "Summary.",
        sections: [{ title: "Tasks", body: "1 open task.", data_present: true }],
        blind_spots: [
          {
            category: "tasks",
            observation: "Open task needs attention",
            suggested_action: "Review tasks",
            related_entity_id: "a0000000-0000-4000-8000-000000000001", // Valid member ID
          },
        ],
        load_attribution: {
          members: [{ name: "Fernando", action_count: 1, mention_count: 1 }],
          observation: "Fernando active",
        },
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 200, costCents: 0.02 },
    });

    const result = await run(richInput, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Valid entity ID kept
    expect(result.data?.blind_spots[0].related_entity_id).toBe("a0000000-0000-4000-8000-000000000001");
  });
});
