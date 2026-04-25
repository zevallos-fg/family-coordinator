/**
 * Integration tests for grocery dedup orchestrator (mocked).
 * Tests orchestrator logic (descriptor stripping → resolve → RPC dispatch) without live DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const { mockResolveIngredient, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockResolveIngredient: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock("@/lib/grocery/resolve-ingredient", () => ({
  resolveIngredient: (...args: unknown[]) => mockResolveIngredient(...args),
}));

// ── Import under test ──────────────────────────────────────────────────────────
import { addGroceryItem } from "@/lib/grocery/dedup";

const FAMILY_ID = "7d0c3888-16c8-4144-b088-428f38a7e93a";
const INGREDIENT_ID = "aaaaaaaa-1111-1111-1111-111111111111";

function makeIngredientFrom() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe("addGroceryItem orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(makeIngredientFrom);
    mockRpc.mockResolvedValue({
      data: [{ grocery_item_id: "bbbbbbbb-2222-2222-2222-222222222222", action: "inserted" }],
      error: null,
    });
    mockResolveIngredient.mockResolvedValue({
      ingredientId: INGREDIENT_ID,
      confidence: "exact",
      cleanedName: "garlic",
      descriptors: [],
      newlyCreated: false,
    });
  });

  it("calls resolveIngredient with raw name and familyId", async () => {
    await addGroceryItem({
      rawName: "garlic, minced",
      qtyValue: 2,
      qtyUnit: "cloves",
      storeId: null,
      familyId: FAMILY_ID,
      createIfMissing: true,
    });
    expect(mockResolveIngredient).toHaveBeenCalledWith(
      expect.objectContaining({ rawName: "garlic, minced", familyId: FAMILY_ID })
    );
  });

  it("returns inserted action and groceryItemId", async () => {
    const result = await addGroceryItem({
      rawName: "garlic",
      qtyValue: 1,
      qtyUnit: "head",
      storeId: null,
      familyId: FAMILY_ID,
    });
    expect(result.action).toBe("inserted");
    expect(result.groceryItemId).toBe("bbbbbbbb-2222-2222-2222-222222222222");
    expect(result.confidence).toBe("exact");
    expect(result.cleanedName).toBe("garlic");
  });

  it("auto-fills storeId from ingredients.preferred_store_id when not provided", async () => {
    const STORE_ID = "cccccccc-3333-3333-3333-333333333333";
    mockFrom.mockImplementation((table: string) => {
      if (table === "ingredients") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { preferred_store_id: STORE_ID },
            error: null,
          }),
        };
      }
      return makeIngredientFrom();
    });

    await addGroceryItem({ rawName: "milk", qtyValue: 1, qtyUnit: "gallon", storeId: null, familyId: FAMILY_ID });

    const rpcCall = mockRpc.mock.calls[0];
    expect(rpcCall[0]).toBe("fn_grocery_upsert");
    expect(rpcCall[1]).toMatchObject({ p_store_id: STORE_ID });
  });

  it("throws if fn_grocery_upsert returns error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB error" } });
    await expect(
      addGroceryItem({ rawName: "flour", qtyValue: 1, qtyUnit: "cup", storeId: null, familyId: FAMILY_ID })
    ).rejects.toThrow("fn_grocery_upsert failed");
  });

  it("two calls with different units: first inserted, second review_required", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [{ grocery_item_id: "id-1", action: "inserted" }], error: null })
      .mockResolvedValueOnce({ data: [{ grocery_item_id: "id-2", action: "review_required" }], error: null });

    const r1 = await addGroceryItem({ rawName: "garlic", qtyValue: 2, qtyUnit: "heads", storeId: null, familyId: FAMILY_ID });
    expect(r1.action).toBe("inserted");

    const r2 = await addGroceryItem({ rawName: "garlic", qtyValue: 4, qtyUnit: "cloves", storeId: null, familyId: FAMILY_ID });
    expect(r2.action).toBe("review_required");
  });
});
