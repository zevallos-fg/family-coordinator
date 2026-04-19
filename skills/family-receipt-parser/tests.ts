import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "../_lib/types";

// Mock callSkill to avoid real API calls
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

const knownStores = [
  { id: "store-publix-id", name: "Publix" },
  { id: "store-costco-id", name: "Costco" },
];

const baseInput = {
  imageBase64: "ZmFrZWltYWdl", // base64 "fakeimage"
  imageMimeType: "image/jpeg" as const,
  knownStores,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("family-receipt-parser", () => {
  it("parses a normal Publix receipt", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        storeId: "store-publix-id",
        storeName: "Publix",
        receiptDate: "2026-04-15",
        items: [
          { name: "BANANAS", quantity: 1, unitPrice: 0.59, totalPrice: 0.59, category: "produce" },
          { name: "WHOLE MILK 1GAL", quantity: 2, unitPrice: 3.99, totalPrice: 7.98, category: "dairy" },
          { name: "SOURDOUGH BREAD", quantity: 1, unitPrice: 4.49, totalPrice: 4.49, category: "bakery" },
        ],
        subtotal: 13.06,
        tax: 0.0,
        total: 13.06,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 500, outputTokens: 300, costCents: 0.05 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.storeId).toBe("store-publix-id");
    expect(result.data?.storeName).toBe("Publix");
    expect(result.data?.receiptDate).toBe("2026-04-15");
    expect(result.data?.items).toHaveLength(3);
    expect(result.data?.items[0].name).toBe("BANANAS");
    expect(result.data?.items[1].quantity).toBe(2);
    expect(result.data?.total).toBe(13.06);
  });

  it("returns storeId=null and storeName when store is unknown", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        storeId: null,
        storeName: "Winn-Dixie",
        receiptDate: "2026-04-10",
        items: [
          { name: "CHICKEN BREAST", quantity: 1, unitPrice: 6.99, totalPrice: 6.99, category: "meat" },
        ],
        subtotal: 6.99,
        tax: 0.42,
        total: 7.41,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 400, outputTokens: 200, costCents: 0.04 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.storeId).toBeNull();
    expect(result.data?.storeName).toBe("Winn-Dixie");
    expect(result.data?.total).toBe(7.41);
  });

  it("handles a blurry/crumpled receipt with minimal data", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        storeId: null,
        storeName: null,
        receiptDate: null,
        items: [],
        subtotal: null,
        tax: null,
        total: 0,
      }),
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 300, outputTokens: 100, costCents: 0.02 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.items).toHaveLength(0);
    expect(result.data?.total).toBe(0);
    expect(result.data?.storeId).toBeNull();
  });

  it("returns parse_error on malformed JSON", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: "Sorry, I cannot read this image.",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 200, outputTokens: 50, costCents: 0.01 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("parse_error");
  });

  it("returns invalid_input when imageBase64 is empty", async () => {
    const result = await run({ ...baseInput, imageBase64: "" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("propagates api_error from callSkill", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: false,
      error: { code: "api_error", message: "Worker 500: internal error" },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("api_error");
  });

  it("parses receipt with markdown-fenced JSON response", async () => {
    mockCallSkill.mockResolvedValueOnce({
      ok: true,
      data: "```json\n" + JSON.stringify({
        storeId: "store-costco-id",
        storeName: "Costco",
        receiptDate: null,
        items: [
          { name: "KIRKLAND OLIVE OIL", quantity: 1, unitPrice: 15.99, totalPrice: 15.99, category: "pantry-staples" },
        ],
        subtotal: 15.99,
        tax: 1.12,
        total: 17.11,
      }) + "\n```",
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 450, outputTokens: 250, costCents: 0.04 },
    });

    const result = await run(baseInput, ctx);
    expect(result.ok).toBe(true);
    expect(result.data?.storeId).toBe("store-costco-id");
    expect(result.data?.total).toBe(17.11);
  });
});
