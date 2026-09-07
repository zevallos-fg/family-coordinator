import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

import { resolveRecipeIngredientIds } from "./ingredients";

const FAMILY_ID = "7d0c3888-16c8-4144-b088-428f38a7e93a";

// Each `.from("ingredients")` is its own call, so a create costs two: the
// lookup that misses, then the insert.
function lookup(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn(),
  };
}

function insert(result: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(result),
    }),
  };
}

const found = (id: string) => ({ data: { id }, error: null });
const missing = { data: null, error: null };
const broken = { data: null, error: { message: "connection reset" } };

beforeEach(() => vi.clearAllMocks());

describe("resolveRecipeIngredientIds", () => {
  it("reuses an existing ingredient and creates only the missing one", async () => {
    const flourLookup = lookup(found("id-flour"));
    const sugarLookup = lookup(missing);
    const sugarInsert = insert(found("id-sugar"));
    mockFrom
      .mockReturnValueOnce(flourLookup)
      .mockReturnValueOnce(sugarLookup)
      .mockReturnValueOnce(sugarInsert);

    const result = await resolveRecipeIngredientIds(FAMILY_ID, ["flour", "sugar"]);

    expect(result).toEqual({ ok: true, ids: { flour: "id-flour", sugar: "id-sugar" } });
    expect(flourLookup.insert).not.toHaveBeenCalled();
    expect(sugarInsert.insert).toHaveBeenCalledOnce();
  });

  // The forking defect: a failed lookup used to read as "no such ingredient",
  // so the next line created a second row for one that already existed.
  it("does NOT create an ingredient when the lookup failed", async () => {
    mockFrom.mockReturnValueOnce(lookup(broken));

    const result = await resolveRecipeIngredientIds(FAMILY_ID, ["flour"]);

    expect(result.ok).toBe(false);
    // One call, and it was the lookup. No insert was even reached for.
    expect(mockFrom).toHaveBeenCalledOnce();
  });

  // The partial-recipe defect: a failed insert used to be filtered out of
  // recipe_ingredients, and the recipe saved reporting success.
  it("refuses the whole set when one insert fails, rather than returning a partial", async () => {
    mockFrom
      .mockReturnValueOnce(lookup(found("id-flour")))
      .mockReturnValueOnce(lookup(missing))
      .mockReturnValueOnce(insert(broken));

    const result = await resolveRecipeIngredientIds(FAMILY_ID, ["flour", "sugar"]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("sugar");
  });

  it("looks up a repeated name once", async () => {
    mockFrom.mockReturnValueOnce(lookup(found("id-flour")));

    const result = await resolveRecipeIngredientIds(FAMILY_ID, ["flour", "flour"]);

    expect(result).toEqual({ ok: true, ids: { flour: "id-flour" } });
    expect(mockFrom).toHaveBeenCalledOnce();
  });
});
