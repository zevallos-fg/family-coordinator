"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as receiptParser from "@/skills/family-receipt-parser";
import type { Output as ParsedReceipt } from "@/skills/family-receipt-parser";
import { lookupFamily } from "@/lib/auth/current-family";

export type { ParsedReceipt };

export interface ParseReceiptResult {
  ok: boolean;
  parsed?: ParsedReceipt;
  error?: string;
}

export async function parseReceiptAction(
  formData: FormData
): Promise<ParseReceiptResult> {
  const file = formData.get("receipt") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided" };
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return { ok: false, error: "Invalid file type. Use JPEG, PNG, or WebP." };
  }

  const bytes = await file.arrayBuffer();
  const imageBase64 = Buffer.from(bytes).toString("base64");
  const imageMimeType = file.type as "image/jpeg" | "image/png" | "image/webp";

  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") return { ok: false, error: "Not signed in" };
    if (family.reason === "no-family") return { ok: false, error: "No family found" };
    return { ok: false, error: "Couldn't reach your family record. Nothing was changed — try again." };
  }
  const familyId = family.familyId;

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .eq("family_id", familyId);

  const knownStores = stores ?? [];

  const result = await withSkillContext(receiptParser.run, {
    imageBase64,
    imageMimeType,
    knownStores,
  });

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error?.message ?? "Parse failed" };
  }

  return { ok: true, parsed: result.data };
}

export interface SaveReceiptInput {
  imageBase64: string;
  imageMimeType: string;
  storeId: string | null;
  storeName: string | null;
  receiptDate: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number;
    category: string | null;
  }>;
  total: number;
}

export interface SaveReceiptResult {
  ok: boolean;
  receiptId?: string;
  error?: string;
  /** Saved, but not entirely. Shown next to the success, not instead of it. */
  warning?: string;
}

export async function saveReceiptAction(
  input: SaveReceiptInput
): Promise<SaveReceiptResult> {
  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") return { ok: false, error: "Not signed in" };
    if (family.reason === "no-family") return { ok: false, error: "No family found" };
    return { ok: false, error: "Couldn't reach your family record. Nothing was changed — try again." };
  }
  const familyId = family.familyId;


  // Upload image to Supabase Storage
  const imageBuffer = Buffer.from(input.imageBase64, "base64");
  const ext = input.imageMimeType === "image/png" ? "png" : "jpg";
  const storagePath = `${familyId}/receipts/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, imageBuffer, {
      contentType: input.imageMimeType,
      upsert: false,
    });

  if (uploadError) {
    // POSTBUILD-T4: storage bucket may not exist yet — fall back to placeholder URL
    console.warn("[saveReceiptAction] storage upload failed, using placeholder", uploadError.message);
  }

  const { data: urlData } = supabase.storage
    .from("receipts")
    .getPublicUrl(storagePath);
  const imageUrl = uploadError
    ? `placeholder://${storagePath}`
    : urlData.publicUrl;

  // Insert receipt row
  let storeId = input.storeId;

  // If storeName provided but no match, create the store.
  //
  // Not fatal, deliberately: the receipt and its line items are the record, and
  // the store is a label on them. Refusing the whole save because a store row
  // could not be created would lose the photo the user just took. But it is not
  // silent either — `storeId = newStore?.id ?? null` used to file the receipt
  // under no store at all and say nothing, which reads later as a receipt that
  // was never assigned rather than one that failed to be.
  let storeWarning: string | null = null;
  if (!storeId && input.storeName) {
    const { data: newStore, error: storeError } = await supabase
      .from("stores")
      .insert({ family_id: familyId, name: input.storeName })
      .select("id")
      .single();
    if (storeError || !newStore) {
      storeWarning = `Saved, but "${input.storeName}" couldn't be added as a store, so this receipt has no store on it.`;
    }
    storeId = newStore?.id ?? null;
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      family_id: familyId,
      created_by_user_id: family.userId,
      store_id: storeId,
      image_url: imageUrl,
      purchased_at: input.receiptDate ? new Date(input.receiptDate).toISOString() : null,
      total_cents: Math.round(input.total * 100),
      parsed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (receiptError || !receipt) {
    return { ok: false, error: receiptError?.message ?? "Failed to save receipt" };
  }

  // Insert receipt items
  let itemsWarning: string | null = null;
  if (input.items.length > 0) {
    const itemRows = input.items.map((item) => ({
      receipt_id: receipt.id,
      name: item.name,
      amount: item.quantity,
      unit: null as string | null,
      price_cents: item.totalPrice ? Math.round(item.totalPrice * 100) : null,
    }));

    const { error: itemsError } = await supabase
      .from("receipt_items")
      .insert(itemRows);

    if (itemsError) {
      console.error("[saveReceiptAction] items insert failed", itemsError.message);
      // The line items are what a receipt is for. Logging this to a console
      // nobody reads and returning plain success meant the user saw "saved",
      // opened the receipt later, and found a total with nothing under it.
      itemsWarning =
        "Saved, but the individual items couldn't be stored — only the total. You may want to re-scan it.";
    }
  }

  revalidatePath("/receipts");
  return {
    ok: true,
    receiptId: receipt.id,
    warning: [storeWarning, itemsWarning].filter(Boolean).join(" ") || undefined,
  };
}

export interface AddReceiptToPantryResult {
  ok: boolean;
  addedCount?: number;
  error?: string;
}

export async function addReceiptItemsToPantryAction(
  receiptId: string
): Promise<AddReceiptToPantryResult> {
  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") return { ok: false, error: "Not signed in" };
    if (family.reason === "no-family") return { ok: false, error: "No family found" };
    return { ok: false, error: "Couldn't reach your family record. Nothing was changed — try again." };
  }
  const familyId = family.familyId;

  const { data: items, error: itemsError } = await supabase
    .from("receipt_items")
    .select("id, name, amount")
    .eq("receipt_id", receiptId);

  if (itemsError || !items) return { ok: false, error: "Could not load receipt items" };

  let addedCount = 0;

  for (const item of items) {
    const canonicalName = item.name.toLowerCase().trim();

    // Check for existing ingredient
    const { data: existingIngredient } = await supabase
      .from("ingredients")
      .select("id")
      .eq("family_id", familyId)
      .eq("canonical_name", canonicalName)
      .maybeSingle();

    let ingredientId: string;

    if (existingIngredient) {
      ingredientId = existingIngredient.id;
    } else {
      const { data: newIngredient, error: ingError } = await supabase
        .from("ingredients")
        .insert({
          family_id: familyId,
          name: item.name,
          canonical_name: canonicalName,
        })
        .select("id")
        .single();

      if (ingError || !newIngredient) continue;
      ingredientId = newIngredient.id;
    }

    // Check for existing pantry entry
    const { data: existingPantry } = await supabase
      .from("pantry_items")
      .select("id, amount")
      .eq("family_id", familyId)
      .eq("ingredient_id", ingredientId)
      .maybeSingle();

    // addedCount used to increment whether or not the write landed, so the
    // "N items added to pantry" confirmation counted attempts, not rows.
    const { error: pantryError } = existingPantry
      ? await supabase
          .from("pantry_items")
          .update({
            amount: (existingPantry.amount ?? 0) + (item.amount ?? 1),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPantry.id)
      : await supabase.from("pantry_items").insert({
          family_id: familyId,
          ingredient_id: ingredientId,
          amount: item.amount ?? 1,
        });

    if (pantryError) {
      console.error("[receipts] pantry write failed", {
        ingredientId,
        error: pantryError.message,
      });
      continue;
    }

    addedCount++;
  }

  revalidatePath("/meal-plans");
  return { ok: true, addedCount };
}
