import "server-only";

import { createClient } from "@/lib/supabase/server";
import { stripDescriptors } from "./strip-descriptors";
import { resolveIngredient } from "./resolve-ingredient";

export interface DedupInput {
  rawName: string;
  qtyValue: number | null;
  qtyUnit: string | null;
  storeId: string | null;
  familyId: string;
  sourceCaptureId?: string;
  createIfMissing?: boolean;
  /** Pass userId to enable Tier 3 Haiku resolution */
  userId?: string;
}

export interface DedupResult {
  groceryItemId: string;
  action: "inserted" | "merged" | "review_required" | "inserted_unmatched";
  ingredientId: string | null;
  confidence: "exact" | "fuzzy" | "haiku" | "unmatched";
  cleanedName: string;
  descriptors: string[];
}

/**
 * Single entry point for adding a grocery item.
 *
 * Flow:
 * 1. stripDescriptors(rawName) → {cleanedName, descriptors}
 * 2. resolveIngredient(cleanedName) → {ingredientId, confidence}
 * 3. Auto-fill storeId from ingredients.preferred_store_id if not provided
 * 4. supabase.rpc('fn_grocery_upsert') → {grocery_item_id, action}
 * 5. Return DedupResult
 */
export async function addGroceryItem(input: DedupInput): Promise<DedupResult> {
  const {
    rawName,
    qtyValue,
    qtyUnit,
    familyId,
    sourceCaptureId,
    createIfMissing = false,
    userId,
  } = input;
  let { storeId } = input;

  const supabase = await createClient();

  // Step 1+2: Resolve ingredient (includes descriptor stripping)
  const resolved = await resolveIngredient({
    rawName,
    familyId,
    createIfMissing,
    userId,
  });

  const { ingredientId, confidence, cleanedName, descriptors } = resolved;

  // Step 3: Auto-fill store from ingredient.preferred_store_id if not given
  if (!storeId && ingredientId) {
    const { data: ingredient } = await supabase
      .from("ingredients")
      .select("preferred_store_id")
      .eq("id", ingredientId)
      .maybeSingle();

    if (ingredient?.preferred_store_id) {
      storeId = ingredient.preferred_store_id;
    }
  }

  // Step 4: Call the PG upsert function
  // The generated types mark p_ingredient_id and p_store_id as non-nullable strings
  // and p_source_capture_id as optional string (not null). But the actual Postgres
  // function accepts null for uuid params. We cast each field individually to satisfy
  // the generated type signature while passing null/undefined at runtime.
  const { data: upsertRows, error } = await supabase.rpc("fn_grocery_upsert", {
    p_family_id: familyId,
    p_ingredient_id: (ingredientId ?? null) as string,
    p_qty_value: qtyValue ?? 0,
    p_qty_unit: qtyUnit ?? "",
    p_store_id: (storeId ?? null) as string,
    p_source_capture_id: sourceCaptureId ?? undefined,
    p_raw_name: rawName,
  });

  if (error || !upsertRows || !Array.isArray(upsertRows) || upsertRows.length === 0) {
    throw new Error(
      `fn_grocery_upsert failed: ${error?.message ?? "empty result"}`
    );
  }

  const row = upsertRows[0] as { grocery_item_id: string; action: string };

  return {
    groceryItemId: row.grocery_item_id,
    action: row.action as DedupResult["action"],
    ingredientId: ingredientId ?? null,
    confidence,
    cleanedName,
    descriptors,
  };
}
