"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as groceryParser from "@/skills/family-grocery-parser";
import { addGroceryItem } from "@/lib/grocery/dedup";

export async function addGroceryItemFromText(formData: FormData) {
  const text = (formData.get("text") as string)?.trim();
  if (!text) return { ok: false, error: "No text provided." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const familyId = membership.family_id;

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .eq("family_id", familyId);

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
        storeId: null,
        familyId,
        userId: user.id,
        createIfMissing: true,
      });
    } catch {
      // Last resort: direct insert
      await supabase.from("grocery_items").insert({ family_id: familyId, name: text });
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
  for (const item of items) {
    try {
      await addGroceryItem({
        rawName: item.name,
        qtyValue: item.quantity !== null ? Number(item.quantity) : null,
        qtyUnit: item.unit ?? null,
        storeId: item.storeId ?? null,
        familyId,
        userId: user.id,
        createIfMissing: true,
      });
      count++;
    } catch {
      // Fallback: direct insert so we never silently drop items
      await supabase.from("grocery_items").insert({
        family_id: familyId,
        name: item.name,
        quantity: item.quantity !== null ? String(item.quantity) + (item.unit ? " " + item.unit : "") : null,
        store_id: item.storeId,
      });
      count++;
    }
  }

  revalidatePath("/grocery");
  revalidatePath("/dashboard");
  return { ok: true, count };
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
