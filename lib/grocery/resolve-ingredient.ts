import "server-only";

import { createClient } from "@/lib/supabase/server";
import { stripDescriptors } from "./strip-descriptors";
import * as ingredientResolver from "@/skills/family-ingredient-resolver";

export interface ResolveInput {
  rawName: string;
  familyId: string;
  createIfMissing?: boolean;
  /** SkillContext for Tier 3 Haiku calls — if omitted, Tier 3 is skipped */
  userId?: string;
}

export interface ResolveResult {
  ingredientId: string | null;
  confidence: "exact" | "fuzzy" | "haiku" | "unmatched";
  cleanedName: string;
  descriptors: string[];
  newlyCreated: boolean;
}

/**
 * Three-tier ingredient resolver.
 *
 * Tier 1: Exact match — case-insensitive lower() comparison
 * Tier 2: Fuzzy match — pg_trgm similarity >= 0.6
 * Tier 3: Haiku skill — synonym/plural/brand resolution
 * Tier 4: Unmatched — optionally creates new ingredient
 *
 * Every call writes to ingredient_resolution_log regardless of outcome.
 */
export async function resolveIngredient(input: ResolveInput): Promise<ResolveResult> {
  const { rawName, familyId, createIfMissing = false, userId } = input;
  const supabase = await createClient();

  const { cleanedName, descriptors } = stripDescriptors(rawName);

  // ── Tier 1: Exact match ────────────────────────────────────────────────────
  const { data: exactMatch } = await supabase
    .from("ingredients")
    .select("id")
    .eq("family_id", familyId)
    .eq("canonical_name", cleanedName.toLowerCase())
    .limit(1)
    .maybeSingle();

  if (exactMatch) {
    await writeLog(supabase, familyId, rawName, cleanedName, exactMatch.id, descriptors, "exact");
    return {
      ingredientId: exactMatch.id,
      confidence: "exact",
      cleanedName,
      descriptors,
      newlyCreated: false,
    };
  }

  // ── Tier 2: Fuzzy match (pg_trgm) ─────────────────────────────────────────
  const { data: fuzzyMatches } = await supabase.rpc("fn_ingredient_fuzzy_search", {
    p_family_id: familyId,
    p_name: cleanedName,
    p_threshold: 0.6,
  });

  if (fuzzyMatches && Array.isArray(fuzzyMatches) && fuzzyMatches.length > 0) {
    const best = fuzzyMatches[0] as { id: string; canonical_name: string; sim: number };
    await writeLog(supabase, familyId, rawName, cleanedName, best.id, descriptors, "fuzzy");
    return {
      ingredientId: best.id,
      confidence: "fuzzy",
      cleanedName,
      descriptors,
      newlyCreated: false,
    };
  }

  // ── Tier 3: Haiku skill ────────────────────────────────────────────────────
  // Load all candidates for this family for Haiku to reason over
  const { data: allIngredients } = await supabase
    .from("ingredients")
    .select("id, canonical_name")
    .eq("family_id", familyId)
    .order("canonical_name");

  const candidates = (allIngredients ?? []).map((r) => ({
    id: r.id,
    canonical_name: r.canonical_name,
  }));

  if (candidates.length > 0 && userId) {
    const skillResult = await ingredientResolver.run(
      { cleanedName, candidates },
      { familyId, userId }
    );

    if (skillResult.ok && skillResult.data) {
      const { resolvedId } = skillResult.data;
      if (resolvedId) {
        await writeLog(supabase, familyId, rawName, cleanedName, resolvedId, descriptors, "haiku");
        return {
          ingredientId: resolvedId,
          confidence: "haiku",
          cleanedName,
          descriptors,
          newlyCreated: false,
        };
      }
    }
  }

  // ── Tier 4: Unmatched ──────────────────────────────────────────────────────
  if (createIfMissing) {
    const { data: newIngredient } = await supabase
      .from("ingredients")
      .insert({ family_id: familyId, canonical_name: cleanedName, name: cleanedName })
      .select("id")
      .single();

    if (newIngredient) {
      await writeLog(supabase, familyId, rawName, cleanedName, newIngredient.id, descriptors, "unmatched");
      return {
        ingredientId: newIngredient.id,
        confidence: "unmatched",
        cleanedName,
        descriptors,
        newlyCreated: true,
      };
    }
  }

  await writeLog(supabase, familyId, rawName, cleanedName, null, descriptors, "unmatched");
  return {
    ingredientId: null,
    confidence: "unmatched",
    cleanedName,
    descriptors,
    newlyCreated: false,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function writeLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  familyId: string,
  rawInput: string,
  cleanedName: string,
  resolvedIngredientId: string | null,
  descriptors: string[],
  confidence: "exact" | "fuzzy" | "haiku" | "unmatched"
): Promise<void> {
  // Pure telemetry: a lost row must never fail the resolution it is describing.
  // Read anyway, because a log that has silently stopped writing is worse than
  // no log at all — it reads as "nothing needed reviewing".
  const { error } = await supabase.from("ingredient_resolution_log").insert({
    family_id: familyId,
    raw_input: rawInput,
    cleaned_name: cleanedName,
    resolved_ingredient_id: resolvedIngredientId,
    descriptors_extracted: descriptors.length > 0 ? descriptors : null,
    confidence,
    reviewed_by_user: false,
  });

  if (error) {
    console.error("[resolveIngredient] resolution log write failed", {
      familyId,
      rawInput,
      error: error.message,
    });
  }
}
