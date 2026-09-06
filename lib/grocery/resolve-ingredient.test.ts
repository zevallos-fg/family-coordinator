import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockFrom, mockRpc, mockSkillRun } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockSkillRun: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock("@/skills/family-ingredient-resolver", () => ({
  run: (...args: unknown[]) => mockSkillRun(...args),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { resolveIngredient } from "./resolve-ingredient";

const FAMILY_ID = "7d0c3888-16c8-4144-b088-428f38a7e93a";
const INGREDIENT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeFromChain(maybeSingleResult: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
  };
}

describe("resolveIngredient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === "ingredient_resolution_log") {
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      return makeFromChain({ data: null, error: null });
    });
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockSkillRun.mockResolvedValue({
      ok: true,
      data: { resolvedId: null, confidence: "unmatched" },
      usage: { model: "claude-haiku-4-5-20251001", inputTokens: 50, outputTokens: 20, costCents: 0.04 },
    });
  });

  describe("Tier 1 — exact match", () => {
    it("returns exact when canonical_name matches (lowercased)", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          return makeFromChain({ data: { id: INGREDIENT_ID }, error: null });
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const result = await resolveIngredient({
        rawName: "garlic",
        familyId: FAMILY_ID,
      });

      expect(result.confidence).toBe("exact");
      expect(result.ingredientId).toBe(INGREDIENT_ID);
      expect(result.newlyCreated).toBe(false);
      expect(result.cleanedName).toBe("garlic");
    });

    it("strips descriptors before T1 lookup: 'garlic, minced' cleans to 'garlic'", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          return makeFromChain({ data: { id: INGREDIENT_ID }, error: null });
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const result = await resolveIngredient({
        rawName: "garlic, minced",
        familyId: FAMILY_ID,
      });

      expect(result.cleanedName).toBe("garlic");
      expect(result.descriptors).toContain("minced");
      expect(result.confidence).toBe("exact");
    });
  });

  describe("Tier 2 — fuzzy match", () => {
    it("returns fuzzy when T1 misses but RPC returns similarity >= 0.6", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          return makeFromChain({ data: null, error: null }); // T1 miss
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      mockRpc.mockResolvedValueOnce({
        data: [{ id: INGREDIENT_ID, canonical_name: "garlic cloves", sim: 0.72 }],
        error: null,
      });

      const result = await resolveIngredient({
        rawName: "garlic",
        familyId: FAMILY_ID,
        userId: USER_ID,
      });

      expect(result.confidence).toBe("fuzzy");
      expect(result.ingredientId).toBe(INGREDIENT_ID);
      expect(result.newlyCreated).toBe(false);
    });
  });

  describe("Tier 3 — haiku skill", () => {
    it("calls skill when T1 and T2 both miss", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          const chain = makeFromChain({ data: null, error: null });
          // order() call for candidates returns an array
          chain.order = vi.fn().mockResolvedValue({
            data: [{ id: INGREDIENT_ID, canonical_name: "green onion" }],
            error: null,
          });
          return chain;
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      mockRpc.mockResolvedValueOnce({ data: [], error: null }); // T2 miss

      mockSkillRun.mockResolvedValueOnce({
        ok: true,
        data: { resolvedId: INGREDIENT_ID, confidence: "haiku" },
        usage: { model: "claude-haiku-4-5-20251001", inputTokens: 50, outputTokens: 30, costCents: 0.05 },
      });

      const result = await resolveIngredient({
        rawName: "green onion",
        familyId: FAMILY_ID,
        userId: USER_ID,
      });

      expect(result.confidence).toBe("haiku");
      expect(result.ingredientId).toBe(INGREDIENT_ID);
      expect(mockSkillRun).toHaveBeenCalledOnce();
    });

    it("skips Tier 3 when userId is not provided", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          return makeFromChain({ data: null, error: null });
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });
      mockRpc.mockResolvedValueOnce({ data: [], error: null });

      const result = await resolveIngredient({
        rawName: "green onion",
        familyId: FAMILY_ID,
        // no userId
      });

      expect(mockSkillRun).not.toHaveBeenCalled();
      expect(result.confidence).toBe("unmatched");
    });
  });

  describe("Tier 4 — unmatched", () => {
    it("returns null when createIfMissing=false", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          const chain = makeFromChain({ data: null, error: null });
          chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
          return chain;
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });
      mockRpc.mockResolvedValueOnce({ data: [], error: null });

      const result = await resolveIngredient({
        rawName: "zaatar powder",
        familyId: FAMILY_ID,
        createIfMissing: false,
        userId: USER_ID,
      });

      expect(result.confidence).toBe("unmatched");
      expect(result.ingredientId).toBeNull();
      expect(result.newlyCreated).toBe(false);
    });

    it("creates ingredient when createIfMissing=true", async () => {
      const newId = "22222222-2222-2222-2222-222222222222";

      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: newId }, error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });
      mockRpc.mockResolvedValueOnce({ data: [], error: null });

      const result = await resolveIngredient({
        rawName: "exotic spice",
        familyId: FAMILY_ID,
        createIfMissing: true,
        userId: USER_ID,
      });

      expect(result.ingredientId).toBe(newId);
      expect(result.newlyCreated).toBe(true);
    });

    it("refuses to create when the candidate list could not be read", async () => {
      // The bug this guards: `allIngredients ?? []` meant a failed candidate
      // query skipped Tier 3 and fell straight into Tier 4, which creates a NEW
      // ingredient — so a transient error permanently forked the family's
      // canonical list, and did it again on every retry.
      const insert = vi.fn().mockReturnThis();

      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredients") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            order: vi
              .fn()
              .mockResolvedValue({ data: null, error: { message: "connection reset" } }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert,
            single: vi.fn().mockResolvedValue({ data: { id: "never" }, error: null }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const result = await resolveIngredient({
        rawName: "exotic spice",
        familyId: FAMILY_ID,
        createIfMissing: true,
        userId: USER_ID,
      });

      expect(result.ingredientId).toBeNull();
      expect(result.newlyCreated).toBe(false);
      expect(result.confidence).toBe("unmatched");
      // Nothing was written to `ingredients`. The grocery item still reaches the
      // list — fn_grocery_upsert takes a null ingredient id — it is just not
      // linked to an ingredient that may well already exist.
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("resolution log", () => {
    it("always writes to ingredient_resolution_log", async () => {
      const logInsertMock = vi.fn().mockResolvedValue({ data: null, error: null });

      mockFrom.mockImplementation((table: string) => {
        if (table === "ingredient_resolution_log") {
          return { insert: logInsertMock };
        }
        return makeFromChain({ data: { id: INGREDIENT_ID }, error: null });
      });

      await resolveIngredient({ rawName: "butter", familyId: FAMILY_ID });

      expect(logInsertMock).toHaveBeenCalledOnce();
      const arg = logInsertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.family_id).toBe(FAMILY_ID);
      expect(arg.raw_input).toBe("butter");
      expect(arg.confidence).toBe("exact");
    });
  });
});
