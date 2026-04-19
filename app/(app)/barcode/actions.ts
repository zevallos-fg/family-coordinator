"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as pantryInference from "@/skills/family-pantry-inference";

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
}

export async function lookupBarcodeAction(
  barcode: string
): Promise<LookupBarcodeResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, cached: false, productName: null, brand: null, category: null, note: null, error: "Not signed in" };

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", authData.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, cached: false, productName: null, brand: null, category: null, note: null, error: "No family found" };

  const familyId = membership.family_id;

  // Check cache first
  const { data: cached } = await supabase
    .from("barcodes")
    .select("id, product_name, brand")
    .eq("family_id", familyId)
    .eq("upc", barcode)
    .maybeSingle();

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

  // Cache the result
  const { data: newEntry } = await supabase
    .from("barcodes")
    .insert({
      family_id: familyId,
      upc: barcode,
      product_name: productName,
      brand,
    })
    .select("id")
    .single();

  return {
    ok: true,
    cached: false,
    barcodeId: newEntry?.id,
    productName,
    brand,
    category,
    confidence,
    note,
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
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, error: "Not signed in" };

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", authData.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, error: "No family found" };
  const familyId = membership.family_id;

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

  if (existingPantry) {
    await supabase
      .from("pantry_items")
      .update({ amount: (existingPantry.amount ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", existingPantry.id);
  } else {
    await supabase.from("pantry_items").insert({
      family_id: familyId,
      ingredient_id: ingredientId,
      amount: 1,
    });
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
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { ok: false, error: "Not signed in" };

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", authData.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, error: "No family found" };

  const { error } = await supabase.from("grocery_items").insert({
    family_id: membership.family_id,
    name: productName,
    quantity: "1",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/grocery");
  return { ok: true };
}
