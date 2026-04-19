import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";

vi.mock("../_lib/runner", () => ({
  callSkill: vi.fn(),
}));

import { callSkill } from "../_lib/runner";
import { run } from "./index";

const mockCallSkill = vi.mocked(callSkill);

const ctx: SkillContext = {
  familyId: "7d0c3888-16c8-4144-b088-428f38a7e93a",
  userId: "a4b2af94-06f5-4a25-b84f-aecb89da9191",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-pantry-inference", () => {
  it("returns high-confidence product for well-known UPC", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        productName: "Kraft Singles American Cheese",
        brand: "Kraft",
        category: "dairy",
        confidence: "high",
        note: "Standard 16-slice package",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 100, outputTokens: 80, costCents: 0.01 },
    });

    const result = await run({ barcode: "021000015603" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.productName).toBe("Kraft Singles American Cheese");
    expect(result.data?.brand).toBe("Kraft");
    expect(result.data?.confidence).toBe("high");
    expect(result.data?.category).toBe("dairy");
  });

  it("returns low confidence with null productName for unknown barcode", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        productName: null,
        brand: null,
        category: null,
        confidence: "low",
        note: "Barcode not recognized",
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 80, outputTokens: 60, costCents: 0.01 },
    });

    const result = await run({ barcode: "999999999999" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.productName).toBeNull();
    expect(result.data?.confidence).toBe("low");
  });

  it("returns parse_error on malformed JSON", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: "I don't know this barcode.",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 80, outputTokens: 30, costCents: 0.01 },
    });

    const result = await run({ barcode: "012345678901" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("returns invalid_input when barcode is empty", async () => {
    const result = await run({ barcode: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("parses markdown-fenced JSON response", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: "```json\n" + JSON.stringify({
        productName: "Quaker Oats Old Fashioned",
        brand: "Quaker",
        category: "pantry-staples",
        confidence: "high",
        note: null,
      }) + "\n```",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 90, outputTokens: 70, costCents: 0.01 },
    });

    const result = await run({ barcode: "030000010204" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.productName).toBe("Quaker Oats Old Fashioned");
    expect(result.data?.confidence).toBe("high");
  });
});
