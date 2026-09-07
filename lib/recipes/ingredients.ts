import "server-only";

import { createClient } from "@/lib/supabase/server";

export type IngredientIds =
  | { ok: true; ids: Record<string, string> }
  | { ok: false; error: string };

/**
 * Canonical-name → ingredient id for every ingredient in an imported recipe,
 * creating the ones that do not exist yet. All or nothing.
 *
 * The three copies this replaces each dropped both errors, and the two failures
 * compounded:
 *
 *   - A failed *lookup* read as "no such ingredient", so the next line created a
 *     second row for an ingredient that already existed. That is the canonical
 *     list forking, the same defect resolve-ingredient had.
 *   - A failed *insert* left the name out of the id map, and the caller's
 *     `.filter(ing => ingredientIds[ing.canonicalName])` quietly dropped it from
 *     recipe_ingredients. The recipe saved, reported success, and was missing
 *     ingredients nobody was told about — which a grocery list built from that
 *     recipe then silently does not shop for.
 *
 * There is no partial answer worth returning here. A recipe with nine of its
 * twelve ingredients is not a nine-ingredient recipe; it is a wrong one, and the
 * only person who can find out is whoever cooks from it.
 */
export async function resolveRecipeIngredientIds(
  familyId: string,
  canonicalNames: readonly string[]
): Promise<IngredientIds> {
  const supabase = await createClient();
  const ids: Record<string, string> = {};

  for (const canonicalName of canonicalNames) {
    if (ids[canonicalName]) continue; // the same name twice in one recipe

    const { data: existing, error: lookupError } = await supabase
      .from("ingredients")
      .select("id")
      .eq("family_id", familyId)
      .eq("canonical_name", canonicalName)
      .maybeSingle();

    if (lookupError) {
      return {
        ok: false,
        error: `Couldn't look up "${canonicalName}" in your ingredients, so the recipe wasn't saved. Try again.`,
      };
    }

    if (existing) {
      ids[canonicalName] = existing.id;
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ingredients")
      .insert({ family_id: familyId, canonical_name: canonicalName, name: canonicalName })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return {
        ok: false,
        error: `Couldn't add "${canonicalName}" to your ingredients, so the recipe wasn't saved. Try again.`,
      };
    }

    ids[canonicalName] = inserted.id;
  }

  return { ok: true, ids };
}
