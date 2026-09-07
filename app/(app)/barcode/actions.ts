"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as pantryInference from "@/skills/family-pantry-inference";
import { lookupFamily } from "@/lib/auth/current-family";

export interface LookupBarcodeResult {
  ok: boolean;
  cached: boolean;
  barcodeId?: string;
  productName: string | null;
  brand: string | null;
  category: string | null;
  confidence?: "high" | "medium" | "low";
  note: string | null;
  error?: string;
  /** The answer is good, but something after it was not. */
  warning?: string;
}

export async function lookupBarcodeAction(
  barcode: string
): Promise<LookupBarcodeResult> {
  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") return { ok: false, cached: false, productName: null, brand: null, category: null, note: null, error: "Not signed in" };
    if (family.reason === "no-family") return { ok: false, cached: false, productName: null, brand: null, category: null, note: null, error: "No family found" };
    return { ok: false, cached: false, productName: null, brand: null, category: null, note: null, error: "Couldn't reach your family record. Nothing was changed — try again." };
  }
  const familyId = family.familyId;


  // Check cache first.
  //
  // The error matters here in a way it does not on most reads: a cache miss is
  // what sends this function to a paid model call. Dropping the error turned
  // every failed lookup into a miss, so a blink of the database bought an answer
  // that was already bought and sitting in this table. Rescanning costs the user
  // a second of camera time; re-answering costs money.
  const { data: cached, error: cacheError } = await supabase
    .from("barcodes")
    .select("id, product_name, brand")
    .eq("family_id", familyId)
    .eq("upc", barcode)
    .maybeSingle();

  if (cacheError) {
    return {
      ok: false,
      cached: false,
      productName: null,
      brand: null,
      category: null,
      note: null,
      error: "Couldn't check what we already know about this barcode. Scan it again in a moment.",
    };
  }

  if (cached) {
    return {
      ok: true,
      cached: true,
      barcodeId: cached.id,
      productName: cached.product_name,
      brand: cached.brand,
      category: null,
      note: null,
    };
  }

  // Not in cache — call the skill
  const result = await withSkillContext(pantryInference.run, { barcode });

  if (!result.ok || !result.data) {
    return {
      ok: false,
      cached: false,
      productName: null,
      brand: null,
      category: null,
      note: null,
      error: result.error?.message ?? "Lookup failed",
    };
  }

  const { productName, brand, category, confidence, note } = result.data;

  // Cache the result.
  //
  // The opposite call to the read above: the model has already been paid for, so
  // refusing now would throw away an answer we own. What a failure here costs is
  // the *next* scan of this barcode, and the one after that, for as long as the
  // write keeps failing. So the answer goes back, and the failure is said out
  // loud rather than discovered on a bill.
  const { data: newEntry, error: cacheWriteError } = await supabase
    .from("barcodes")
    .insert({
      family_id: familyId,
      upc: barcode,
      product_name: productName,
      brand,
    })
    .select("id")
    .single();

  if (cacheWriteError) {
    console.error(
      "[barcode] result not cached, this UPC will be looked up again:",
      cacheWriteError.message
    );
  }

  return {
    ok: true,
    cached: false,
    barcodeId: newEntry?.id,
    productName,
    brand,
    category,
    confidence,
    note,
    warning: cacheWriteError
      ? "Couldn't save this to your barcode list, so scanning it again will look it up again."
      : undefined,
  };
}

export interface AddBarcodeToPantryResult {
  ok: boolean;
  error?: string;
}

export async function addBarcodeToPantryAction(
  barcode: string,
  productName: string,
  brand: string | null
): Promise<AddBarcodeToPantryResult> {
  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") return { ok: false, error: "Not signed in" };
    if (family.reason === "no-family") return { ok: false, error: "No family found" };
    return { ok: false, error: "Couldn't reach your family record. Nothing was changed — try again." };
  }
  const familyId = family.familyId;

  const canonicalName = productName.toLowerCase().trim();

  const { data: existing } = await supabase
    .from("ingredients")
    .select("id")
    .eq("family_id", familyId)
    .eq("canonical_name", canonicalName)
    .maybeSingle();

  let ingredientId: string;

  if (existing) {
    ingredientId = existing.id;
  } else {
    const { data: newIng, error } = await supabase
      .from("ingredients")
      .insert({ family_id: familyId, name: productName, canonical_name: canonicalName })
      .select("id")
      .single();
    if (error || !newIng) return { ok: false, error: error?.message ?? "Failed to create ingredient" };
    ingredientId = newIng.id;
  }

  const { data: existingPantry } = await supabase
    .from("pantry_items")
    .select("id, amount")
    .eq("family_id", familyId)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();

  // Adding to the pantry is the entire point of the scan, so a failure here is
  // the action failing — not something to shrug off after the barcode resolved.
  const { error: pantryError } = existingPantry
    ? await supabase
        .from("pantry_items")
        .update({ amount: (existingPantry.amount ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", existingPantry.id)
    : await supabase.from("pantry_items").insert({
        family_id: familyId,
        ingredient_id: ingredientId,
        amount: 1,
      });

  if (pantryError) {
    return { ok: false, error: pantryError.message };
  }

  revalidatePath("/meal-plans");
  return { ok: true };
}

export interface AddBarcodeToGroceryResult {
  ok: boolean;
  error?: string;
}

export async function addBarcodeToGroceryAction(
  productName: string
): Promise<AddBarcodeToGroceryResult> {
  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") return { ok: false, error: "Not signed in" };
    if (family.reason === "no-family") return { ok: false, error: "No family found" };
    return { ok: false, error: "Couldn't reach your family record. Nothing was changed — try again." };
  }
  const familyId = family.familyId;

  const { error } = await supabase.from("grocery_items").insert({
    family_id: familyId,
    name: productName,
    quantity: "1",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/grocery");
  return { ok: true };
}
