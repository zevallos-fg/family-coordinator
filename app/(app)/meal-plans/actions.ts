"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as recipeImporter from "@/skills/family-recipe-importer";
import * as mealPlanner from "@/skills/family-meal-planner";
import { addGroceryItem } from "@/lib/grocery/dedup";

// ── helpers ──────────────────────────────────────────────────────────────────

async function getFamilyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.family_id ?? null;
}

// ── Recipe actions ────────────────────────────────────────────────────────────

export async function importRecipeAction(url: string): Promise<{ error?: string; recipeId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found — complete onboarding first" };

// Fetch HTML from the recipe URL
  // We send a real-browser User-Agent to bypass bot detection on recipe sites.
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return { error: `Could not fetch page (HTTP ${res.status})` };
    html = await res.text();
  } catch (err) {
    return {
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Page took too long to load"
          : "Could not reach that URL",
    };
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from("recipes")
    .select("id")
    .eq("family_id", familyId)
    .eq("source_url", url)
    .maybeSingle();
  if (existing) return { recipeId: existing.id };

  // Invoke skill
  const result = await withSkillContext(recipeImporter.run, { mode: "url", url, html });
  if (!result.ok) {
    if (result.error?.code === "budget_exceeded") {
      return { error: "Family monthly AI budget reached. Try again next month." };
    }
    return { error: result.error?.message ?? "Recipe import failed" };
  }

  const recipe = result.data!;

  // Upsert ingredients and build id map
  const ingredientIds: Record<string, string> = {};
  for (const ing of recipe.ingredients) {
    const { data: existing } = await supabase
      .from("ingredients")
      .select("id")
      .eq("family_id", familyId)
      .eq("canonical_name", ing.canonicalName)
      .maybeSingle();

    if (existing) {
      ingredientIds[ing.canonicalName] = existing.id;
    } else {
      const { data: inserted } = await supabase
        .from("ingredients")
        .insert({ family_id: familyId, canonical_name: ing.canonicalName, name: ing.canonicalName })
        .select("id")
        .single();
      if (inserted) ingredientIds[ing.canonicalName] = inserted.id;
    }
  }

  // Total time: use cook_time_min for the sum
  const cookTimeMin = recipe.cookTimeMin ?? recipe.totalTimeMin ?? null;
  const prepTimeMin = recipe.prepTimeMin ?? null;

  // Insert recipe with all enriched fields from the upgraded importer
  const { data: newRecipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      family_id: familyId,
      title: recipe.name,
      description: recipe.description,
      source_url: recipe.sourceUrl,
      servings: recipe.servings,
      prep_time_min: prepTimeMin,
      cook_time_min: cookTimeMin,
      tags: recipe.tags.length > 0 ? recipe.tags : null,
      instructions: recipe.instructions.length > 0 ? JSON.stringify(recipe.instructions) : null,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (recipeErr || !newRecipe) return { error: "Failed to save recipe" };

  // Insert recipe_ingredients
  const ingredientRows = recipe.ingredients
    .filter(ing => ingredientIds[ing.canonicalName])
    .map(ing => ({
      recipe_id: newRecipe.id,
      ingredient_id: ingredientIds[ing.canonicalName],
      amount: ing.quantity,
      unit: ing.unit,
      notes: ing.note,
    }));

  if (ingredientRows.length > 0) {
    await supabase.from("recipe_ingredients").insert(ingredientRows);
  }

  revalidatePath("/meal-plans/recipes");
  return { recipeId: newRecipe.id };
}

// ── Photo-based recipe import (no URL fetch; works on blocked sites and cookbook photos)

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export async function importRecipeFromPhotoAction(
  formData: FormData
): Promise<{ error?: string; recipeId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found — complete onboarding first" };

  const file = formData.get("image");
  if (!(file instanceof File)) return { error: "No image uploaded" };
  if (file.size === 0) return { error: "Image file is empty" };
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image is larger than 5MB. Try a smaller photo or crop it first." };
  }
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
    return { error: "Image must be JPEG, PNG, or WEBP" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buffer.toString("base64");
  const imageMimeType = file.type as SupportedImageType;

  const result = await withSkillContext(recipeImporter.run, {
    mode: "image",
    imageBase64,
    imageMimeType,
  });

  if (!result.ok) {
    if (result.error?.code === "budget_exceeded") {
      return { error: "Family monthly AI budget reached. Try again next month." };
    }
    return { error: result.error?.message ?? "Recipe import failed" };
  }

  const recipe = result.data!;

  // Upsert ingredients and build id map (same pattern as importRecipeAction)
  const ingredientIds: Record<string, string> = {};
  for (const ing of recipe.ingredients) {
    const { data: existing } = await supabase
      .from("ingredients")
      .select("id")
      .eq("family_id", familyId)
      .eq("canonical_name", ing.canonicalName)
      .maybeSingle();

    if (existing) {
      ingredientIds[ing.canonicalName] = existing.id;
    } else {
      const { data: inserted } = await supabase
        .from("ingredients")
        .insert({ family_id: familyId, canonical_name: ing.canonicalName, name: ing.canonicalName })
        .select("id")
        .single();
      if (inserted) ingredientIds[ing.canonicalName] = inserted.id;
    }
  }

  // Insert recipe with enriched fields — source_url is empty for photo imports
  const { data: newRecipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      family_id: familyId,
      title: recipe.name,
      description: recipe.description,
      source_url: "",
      servings: recipe.servings,
      prep_time_min: recipe.prepTimeMin ?? null,
      cook_time_min: recipe.cookTimeMin ?? recipe.totalTimeMin ?? null,
      tags: recipe.tags.length > 0 ? recipe.tags : null,
      instructions: recipe.instructions.length > 0 ? JSON.stringify(recipe.instructions) : null,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (recipeErr || !newRecipe) return { error: "Failed to save recipe" };

  // Insert recipe_ingredients
  const ingredientRows = recipe.ingredients
    .filter(ing => ingredientIds[ing.canonicalName])
    .map(ing => ({
      recipe_id: newRecipe.id,
      ingredient_id: ingredientIds[ing.canonicalName],
      amount: ing.quantity,
      unit: ing.unit,
      notes: ing.note,
    }));

  if (ingredientRows.length > 0) {
    await supabase.from("recipe_ingredients").insert(ingredientRows);
  }

  revalidatePath("/meal-plans/recipes");
  return { recipeId: newRecipe.id };
}
export async function deleteRecipeAction(recipeId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found" };

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", recipeId)
    .eq("family_id", familyId);

  if (error) return { error: error.message };
  revalidatePath("/meal-plans/recipes");
  return {};
}

// ── Pantry actions ────────────────────────────────────────────────────────────

export async function addPantryItemAction(data: {
  ingredientName: string;
  amount: number | null;
  unit: string | null;
  expiresOn: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found" };

  const canonicalName = data.ingredientName.trim().toLowerCase();
  if (!canonicalName) return { error: "Ingredient name is required" };

  // Upsert ingredient
  let ingredientId: string;
  const { data: existing } = await supabase
    .from("ingredients")
    .select("id")
    .eq("family_id", familyId)
    .eq("canonical_name", canonicalName)
    .maybeSingle();

  if (existing) {
    ingredientId = existing.id;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("ingredients")
      .insert({ family_id: familyId, canonical_name: canonicalName, name: canonicalName })
      .select("id")
      .single();
    if (insertErr || !inserted) return { error: "Failed to create ingredient" };
    ingredientId = inserted.id;
  }

  const { error } = await supabase.from("pantry_items").insert({
    family_id: familyId,
    ingredient_id: ingredientId,
    amount: data.amount,
    unit: data.unit,
    expires_on: data.expiresOn,
  });

  if (error) return { error: error.message };
  revalidatePath("/meal-plans/pantry");
  return {};
}

export async function updatePantryItemAction(id: string, amount: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found" };

  const { error } = await supabase
    .from("pantry_items")
    .update({ amount, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("family_id", familyId);

  if (error) return { error: error.message };
  revalidatePath("/meal-plans/pantry");
  return {};
}

export async function removePantryItemAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found" };

  const { error } = await supabase
    .from("pantry_items")
    .delete()
    .eq("id", id)
    .eq("family_id", familyId);

  if (error) return { error: error.message };
  revalidatePath("/meal-plans/pantry");
  return {};
}

export async function searchIngredientsAction(query: string): Promise<Array<{ id: string; name: string }>> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return [];

  const { data } = await supabase
    .from("ingredients")
    .select("id, canonical_name")
    .eq("family_id", familyId)
    .ilike("canonical_name", `%${query}%`)
    .order("canonical_name")
    .limit(10);

  return (data ?? []).map(r => ({ id: r.id, name: r.canonical_name }));
}

// ── Meal plan actions ─────────────────────────────────────────────────────────

type GeneratePlanResult =
  | { planId: string; requiresConfirmation?: undefined; error?: undefined }
  | { requiresConfirmation: true; existingPlanId: string; existingCreatedAt: string; planId?: undefined; error?: undefined }
  | { error: string; planId?: undefined; requiresConfirmation?: undefined };

export async function generatePlanAction(weekOf: string): Promise<GeneratePlanResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found — complete onboarding first" };

  // Check for existing plan — return confirmation request without calling Sonnet
  const { data: existing } = await supabase
    .from("meal_plans")
    .select("id, created_at")
    .eq("family_id", familyId)
    .eq("week_start_date", weekOf)
    .maybeSingle();

  if (existing) {
    return {
      requiresConfirmation: true,
      existingPlanId: existing.id,
      existingCreatedAt: existing.created_at,
    };
  }

  return runPlanGeneration(supabase, familyId, weekOf, user.id);
}

// Replace an existing plan: delete old → generate new, all guarded so no half-states on Sonnet failure.
export async function replacePlanAction(
  existingPlanId: string,
  weekOf: string
): Promise<{ error?: string; planId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found" };

  // Verify plan belongs to this family
  const { data: planCheck } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("id", existingPlanId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (!planCheck) return { error: "Plan not found" };

  // Run Sonnet BEFORE deleting — if generation fails, the old plan survives
  const result = await runPlanGeneration(supabase, familyId, weekOf, user.id, existingPlanId);
  return result;
}

async function runPlanGeneration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  familyId: string,
  weekOf: string,
  userId: string,
  deletePlanId?: string
): Promise<{ error: string; planId?: undefined } | { planId: string; error?: undefined }> {
  // Load family settings (default_serves) and recipes in parallel
  const [{ data: familyData }, { data: recipesRaw }] = await Promise.all([
    supabase
      .from("families")
      .select("default_serves")
      .eq("id", familyId)
      .maybeSingle(),
    supabase
      .from("recipes")
      .select("id, title, servings, cook_time_min, recipe_ingredients(amount, unit, ingredients(canonical_name))")
      .eq("family_id", familyId),
  ]);

  const servingsPerMeal = familyData?.default_serves ?? 4;

  if (!recipesRaw || recipesRaw.length === 0) {
    return { error: "No recipes found. Import some recipes first." };
  }

  const recipes = recipesRaw.map(r => ({
    id: r.id,
    name: r.title,
    servings: r.servings ?? 4,
    totalTimeMin: r.cook_time_min,
    ingredients: (r.recipe_ingredients as Array<{ amount: number | null; unit: string | null; ingredients: { canonical_name: string } | null }>)
      .filter(ri => ri.ingredients)
      .map(ri => ({
        canonicalName: ri.ingredients!.canonical_name,
        quantity: ri.amount,
        unit: ri.unit,
      })),
  }));

  // Load pantry
  const { data: pantryRaw } = await supabase
    .from("pantry_items")
    .select("amount, unit, ingredients(canonical_name)")
    .eq("family_id", familyId)
    .gt("amount", 0);

  const pantry = (pantryRaw ?? [])
    .filter(p => (p.ingredients as { canonical_name: string } | null)?.canonical_name)
    .map(p => ({
      ingredientName: (p.ingredients as { canonical_name: string }).canonical_name,
      quantity: p.amount ?? 0,
      unit: p.unit ?? "",
    }));

  // Build 7 days of meals starting from weekOf (Monday)
  const monday = new Date(weekOf + "T12:00:00");
  const mealsNeeded = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      date: d.toISOString().split("T")[0],
      mealTypes: ["breakfast", "lunch", "dinner"] as Array<"breakfast" | "lunch" | "dinner">,
    };
  });

  // Invoke flagship Sonnet skill
  const result = await withSkillContext(mealPlanner.run, {
    recipes,
    pantry,
    mealsNeeded,
    preferences: {
      servingsPerMeal,
      dislikes: [],
      dietaryConstraints: [],
      varietyPreference: "medium",
    },
  });

  if (!result.ok) {
    if (result.error?.code === "budget_exceeded") {
      return { error: "Family monthly AI budget reached ($10). Try again next month." };
    }
    return { error: result.error?.message ?? "Meal plan generation failed" };
  }

  // Sonnet succeeded — now it's safe to delete the old plan (CASCADE clears entries)
  if (deletePlanId) {
    await supabase.from("meal_plans").delete().eq("id", deletePlanId);
  }

  const plan = result.data!;

  // Insert meal_plan
  const { data: mealPlan, error: planErr } = await supabase
    .from("meal_plans")
    .insert({ family_id: familyId, week_start_date: weekOf })
    .select("id")
    .single();

  if (planErr || !mealPlan) return { error: "Failed to create meal plan" };

  // Insert meal_plan_entries
  const entryRows = plan.entries.map(e => ({
    meal_plan_id: mealPlan.id,
    date: e.date,
    meal_type: e.mealType,
    recipe_id: e.recipeId,
    notes: e.notes,
  }));

  if (entryRows.length > 0) {
    await supabase.from("meal_plan_entries").insert(entryRows);
  }

  // Resolve suggestedStore names to UUIDs (fixes silent store-drop bug)
  const { data: storeList } = await supabase
    .from("stores")
    .select("id, name")
    .eq("family_id", familyId);
  const storeByName: Record<string, string> = {};
  for (const s of storeList ?? []) {
    storeByName[s.name.toLowerCase()] = s.id;
  }

  // Write grocery delta items via dedup orchestrator
  const filteredDelta = plan.groceryDelta.filter(
    (g) => (g.quantityNeeded ?? 0) > 0 || g.quantityNeeded === null
  );

  for (const g of filteredDelta) {
    const resolvedStoreId = g.suggestedStore
      ? (storeByName[g.suggestedStore.toLowerCase()] ?? null)
      : null;

    try {
      await addGroceryItem({
        rawName: g.name,
        qtyValue: g.quantityNeeded !== null ? g.quantityNeeded : null,
        qtyUnit: g.unit ?? null,
        storeId: resolvedStoreId,
        familyId,
        userId,
        createIfMissing: true,
      });
    } catch {
      // Fallback: direct insert so we never silently drop grocery delta items
      await supabase.from("grocery_items").insert({
        family_id: familyId,
        name: g.quantityNeeded !== null && g.unit
          ? `${g.name} (${g.quantityNeeded} ${g.unit})`
          : g.name,
        quantity: g.quantityNeeded !== null
          ? `${g.quantityNeeded}${g.unit ? ` ${g.unit}` : ""}`
          : null,
        in_cart: false,
      });
    }
  }

  revalidatePath("/meal-plans");
  revalidatePath("/meal-plans");
  return { planId: mealPlan.id };
}

// ── Manual recipe entry ───────────────────────────────────────────────────────

export interface ManualIngredientRow {
  name: string;
  qty: number | null;
  unit: string;
  notes: string;
}

export async function addRecipeAction(
  title: string,
  servings: number,
  ingredients: ManualIngredientRow[],
  optional?: {
    description?: string;
    prepTimeMin?: number | null;
    cookTimeMin?: number | null;
    cuisine?: string;
    tags?: string;
    instructions?: string;
  }
): Promise<{ error?: string; recipeId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found — complete onboarding first" };

  const tags = optional?.tags
    ? optional.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : null;

  const { data: newRecipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      family_id: familyId,
      title: title.trim(),
      description: optional?.description?.trim() || null,
      servings,
      prep_time_min: optional?.prepTimeMin ?? null,
      cook_time_min: optional?.cookTimeMin ?? null,
      cuisine: optional?.cuisine?.trim() || null,
      tags: tags && tags.length > 0 ? tags : null,
      instructions: optional?.instructions?.trim()
        ? JSON.stringify([{ step: 1, text: optional.instructions.trim() }])
        : null,
      source_url: "",
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (recipeErr || !newRecipe) return { error: "Failed to save recipe" };

  const { resolveIngredient } = await import("@/lib/grocery/resolve-ingredient");
  for (const ing of ingredients) {
    if (!ing.name.trim()) continue;
    const resolved = await resolveIngredient({ rawName: ing.name, familyId, createIfMissing: true, userId: user.id });
    if (!resolved.ingredientId) continue;
    await supabase.from("recipe_ingredients").insert({
      recipe_id: newRecipe.id,
      ingredient_id: resolved.ingredientId,
      amount: ing.qty,
      unit: ing.unit?.trim() || null,
      notes: resolved.descriptors.length > 0 ? resolved.descriptors.join(", ") : (ing.notes?.trim() || null),
    });
  }

  revalidatePath("/meal-plans/recipes");
  return { recipeId: newRecipe.id };
}

export async function swapMealEntryAction(entryId: string, newRecipeId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const familyId = await getFamilyId(supabase, user.id);
  if (!familyId) return { error: "No family found" };

  // Verify recipe belongs to family
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", newRecipeId)
    .eq("family_id", familyId)
    .maybeSingle();

  if (!recipe) return { error: "Recipe not found" };

  const { error } = await supabase
    .from("meal_plan_entries")
    .update({ recipe_id: newRecipeId, notes: null })
    .eq("id", entryId);

  if (error) return { error: error.message };
  revalidatePath("/meal-plans");
  return {};
}
