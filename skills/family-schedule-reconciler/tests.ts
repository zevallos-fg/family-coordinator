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

const validInput = {
  imageBase64: "dGVzdGltYWdl",
  imageMimeType: "image/jpeg" as const,
  weekOf: "2025-03-03",
  knownNames: ["Fernando", "Yenny"],
};

const validOutput = {
  days: [
    {
      date: "2025-03-03",
      duties: {
        dropoff: { assignee: "Fernando", confidence: 0.9 },
        pickup: { assignee: "Yenny", confidence: 0.8 },
        nap: { assignee: "Fernando", confidence: 0.85 },
      },
      events: [
        {
          title: "Standup",
          startTime: "09:00",
          endTime: "09:30",
          color: "blue",
          assignee: "Fernando",
          ignored: false,
        },
        {
          title: "Work shift",
          startTime: "08:00",
          endTime: "17:00",
          color: "red",
          assignee: "Yenny",
          ignored: true,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-schedule-reconciler", () => {
  it("returns parsed schedule for valid image input", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify(validOutput),
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 500,
        outputTokens: 300,
        costCents: 0.05,
      },
    });

    const result = await run(validInput, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.days).toHaveLength(1);
    expect(result.data?.days[0].duties.dropoff.assignee).toBe("Fernando");
    expect(result.data?.days[0].duties.pickup.assignee).toBe("Yenny");
    expect(result.data?.days[0].events).toHaveLength(2);
    expect(result.data?.days[0].events[1].ignored).toBe(true);
  });

  it("handles JSON fenced in markdown code blocks", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "```json\n" + JSON.stringify(validOutput) + "\n```",
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 500,
        outputTokens: 300,
        costCents: 0.05,
      },
    });

    const result = await run(validInput, ctx);
    expect(result.ok).toBe(true);
  });

  it("returns invalid_input error when imageBase64 is empty", async () => {
    const result = await run({ ...validInput, imageBase64: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(mockCallSkill).not.toHaveBeenCalled();
  });

  it("returns invalid_input error when weekOf is missing", async () => {
    const result = await run({ ...validInput, weekOf: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("returns invalid_input error when knownNames is empty", async () => {
    const result = await run({ ...validInput, knownNames: [] }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("returns parse_error when model response is malformed JSON", async () => {
    mockCallSkill.mockResolvedValue({
      ok: true,
      data: "not valid json",
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 400,
        outputTokens: 50,
        costCents: 0.01,
      },
    });

    const result = await run(validInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("propagates budget_exceeded without wrapping", async () => {
    mockCallSkill.mockResolvedValue({
      ok: false,
      error: { code: "budget_exceeded", message: "Monthly cap reached" },
    });

    const result = await run(validInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("budget_exceeded");
  });

  it("handles schedule with DISCUSS assignments", async () => {
    const outputWithDiscuss = {
      days: [
        {
          date: "2025-03-03",
          duties: {
            dropoff: { assignee: "DISCUSS", confidence: 0.5 },
            pickup: { assignee: "DISCUSS", confidence: 0.5 },
          },
          events: [],
        },
      ],
    };

    mockCallSkill.mockResolvedValue({
      ok: true,
      data: JSON.stringify(outputWithDiscuss),
      usage: {
        model: "claude-haiku-4-5-20251001",
        inputTokens: 400,
        outputTokens: 150,
        costCents: 0.02,
      },
    });

    const result = await run(validInput, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.days[0].duties.dropoff.assignee).toBe("DISCUSS");
  });
});
