"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as captureRouter from "@/skills/family-capture-router";
import { addGroceryItem } from "@/lib/grocery/dedup";

export async function saveCapture(formData: FormData) {
  const text = (formData.get("text") as string)?.trim();
  const voiceTranscription = formData.get("voice") === "true";

  if (!text) return { ok: false, error: "Nothing to capture." };

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

  // Fetch categories for routing context
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("family_id", familyId)
    .order("sort_order");

  const result = await withSkillContext(captureRouter.run, {
    text,
    categories: categories ?? [],
  });

  if (!result.ok || !result.data) {
    // Skill failed — still save the capture without routing. This is the last
    // copy of something the user may have spoken once, so if even the plain
    // insert fails they have to be told rather than shown a tick.
    const { error: fallbackError } = await supabase.from("captures").insert({
      family_id: familyId,
      text,
      voice_transcription: voiceTranscription,
      created_by_user_id: user.id,
    });
    if (fallbackError) {
      return { ok: false, error: "Couldn't save that. Try again?" };
    }
    revalidatePath("/capture");
    revalidatePath("/organized");
    return { ok: true, routed: false };
  }

  const { categoryId, isGrocery, groceryItems } = result.data;

  // Insert capture
  const { data: capture, error: captureErr } = await supabase
    .from("captures")
    .insert({
      family_id: familyId,
      text,
      category_id: categoryId,
      voice_transcription: voiceTranscription,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (captureErr) {
    return { ok: false, error: captureErr.message };
  }

  // If grocery, route each item through the dedup orchestrator
  const droppedItems: string[] = [];
  if (isGrocery && groceryItems.length > 0) {
    for (const name of groceryItems as string[]) {
      try {
        await addGroceryItem({
          rawName: name,
          qtyValue: null,
          qtyUnit: null,
          storeId: null,
          familyId,
          sourceCaptureId: capture?.id ?? undefined,
          userId: user.id,
          createIfMissing: true,
        });
      } catch {
        // Fallback: direct insert so we never drop items — which only holds if
        // the fallback's own error is read.
        const { error: itemError } = await supabase.from("grocery_items").insert({
          family_id: familyId,
          name,
          source_capture_id: capture?.id ?? null,
        });
        if (itemError) droppedItems.push(name);
      }
    }
  }

  revalidatePath("/capture");
  revalidatePath("/organized");
  revalidatePath("/grocery");
  revalidatePath("/dashboard");

  // The capture itself is saved either way; naming what did not reach the list
  // is the difference between a partial success and a lie.
  if (droppedItems.length > 0) {
    return {
      ok: true,
      routed: true,
      isGrocery,
      warning: `Saved, but these didn't reach your grocery list: ${droppedItems.join(", ")}.`,
    };
  }
  return { ok: true, routed: true, isGrocery };
}
