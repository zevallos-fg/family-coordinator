"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as groceryParser from "@/skills/family-grocery-parser";
import { addGroceryItem } from "@/lib/grocery/dedup";
import { requireFamily } from "@/lib/auth/current-family";

export async function addGroceryItemFromText(formData: FormData) {
  const text = (formData.get("text") as string)?.trim();
  if (!text) return { ok: false, error: "No text provided." };

  const supabase = await createClient();
  const { userId, familyId } = await requireFamily();


  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .eq("family_id", familyId);

  // The form's remembered store. Only a fallback: anything the text names ("at Costco")
  // wins. Validated against this family's stores so a stale or foreign id is ignored
  // rather than written.
  const requestedStoreId = (formData.get("defaultStoreId") as string) || null;
  const defaultStoreId =
    requestedStoreId && (stores ?? []).some((s) => s.id === requestedStoreId)
      ? requestedStoreId
      : null;

  const result = await withSkillContext(groceryParser.run, {
    text,
    stores: stores ?? [],
  });

  if (!result.ok || !result.data) {
    // Fallback: route through dedup even on skill failure
    try {
      await addGroceryItem({
        rawName: text,
        qtyValue: null,
        qtyUnit: null,
        storeId: defaultStoreId,
        familyId,
        userId: userId,
        createIfMissing: true,
      });
    } catch {
      // Last resort: direct insert. If this fails too the item is genuinely gone,
      // and saying "added" would be the one outcome worse than an error.
      const { error: lastResortError } = await supabase
        .from("grocery_items")
        .insert({ family_id: familyId, name: text, store_id: defaultStoreId });
      if (lastResortError) {
        return { ok: false, error: "Couldn't add that item. Try again?" };
      }
    }
    revalidatePath("/grocery");
    revalidatePath("/dashboard");
    return { ok: true, count: 1 };
  }

  const items = result.data.items;
  if (items.length === 0) {
    return { ok: false, error: "No grocery items found in that text." };
  }

  // Route each parsed item through the dedup orchestrator
  let count = 0;
  const dropped: string[] = [];
  let lastAction: string | undefined;
  let lastName: string | undefined;
  for (const item of items) {
    try {
      const dedup = await addGroceryItem({
        rawName: item.name,
        qtyValue: item.quantity !== null ? Number(item.quantity) : null,
        qtyUnit: item.unit ?? null,
        storeId: item.storeId ?? defaultStoreId,
        familyId,
        userId: userId,
        createIfMissing: true,
      });
      lastAction = dedup.action;
      lastName = dedup.cleanedName || item.name;
      count++;
    } catch {
      // Fallback: direct insert so we never silently drop items. The count used
      // to increment whether or not this insert worked, so "3 items added" could
      // mean one item added and two lost.
      const { error: fallbackError } = await supabase.from("grocery_items").insert({
        family_id: familyId,
        name: item.name,
        quantity: item.quantity !== null ? String(item.quantity) + (item.unit ? " " + item.unit : "") : null,
        store_id: item.storeId ?? defaultStoreId,
      });
      if (fallbackError) dropped.push(item.name);
      else count++;
    }
  }

  revalidatePath("/grocery");
  revalidatePath("/dashboard");

  if (dropped.length > 0 && count === 0) {
    return { ok: false, error: `Couldn't add ${dropped.join(", ")}. Try again?` };
  }

  return {
    ok: true,
    count,
    action: count === 1 ? lastAction : undefined,
    name: count === 1 ? lastName : undefined,
    warning:
      dropped.length > 0
        ? `These didn't make it onto the list: ${dropped.join(", ")}.`
        : undefined,
  };
}

export async function updateGroceryStore(id: string, storeId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("grocery_items")
    .update({ store_id: storeId })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/grocery");
  return { ok: true };
}

export async function previewDedup(
  rawText: string,
  familyId: string
): Promise<{ willMerge: boolean; existingItem?: { name: string; qty_value: number | null; qty_unit: string | null } }> {
  const { stripDescriptors } = await import("@/lib/grocery/strip-descriptors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { willMerge: false };

  const { cleanedName } = stripDescriptors(rawText);
  if (!cleanedName) return { willMerge: false };

  const { data: exactMatch } = await supabase
    .from("ingredients")
    .select("id")
    .eq("family_id", familyId)
    .eq("canonical_name", cleanedName.toLowerCase())
    .limit(1)
    .maybeSingle();

  if (!exactMatch) return { willMerge: false };

  const { data: existing } = await supabase
    .from("grocery_items")
    .select("id, name, qty_value, qty_unit")
    .eq("family_id", familyId)
    .eq("ingredient_id", exactMatch.id)
    .eq("in_cart", false)
    .is("completed_at", null)
    .limit(1)
    .maybeSingle();

  if (!existing) return { willMerge: false };

  return {
    willMerge: true,
    existingItem: {
      name: existing.name,
      qty_value: existing.qty_value,
      qty_unit: existing.qty_unit,
    },
  };
}

export async function toggleInCart(id: string, currentValue: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("grocery_items")
    .update({ in_cart: !currentValue })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/grocery");
  return { ok: true };
}

export async function deleteGroceryItem(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("grocery_items").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/grocery");
  revalidatePath("/dashboard");
  return { ok: true };
}
