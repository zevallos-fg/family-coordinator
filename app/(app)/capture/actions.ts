"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as captureRouter from "@/skills/family-capture-router";

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
    // Skill failed — still save the capture without routing
    await supabase.from("captures").insert({
      family_id: familyId,
      text,
      voice_transcription: voiceTranscription,
      created_by_user_id: user.id,
    });
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

  // If grocery, split into grocery_items
  if (isGrocery && groceryItems.length > 0) {
    const groceryRows = groceryItems.map((name: string) => ({
      family_id: familyId,
      name,
      source_capture_id: capture?.id ?? null,
    }));
    await supabase.from("grocery_items").insert(groceryRows);
  }

  revalidatePath("/capture");
  revalidatePath("/organized");
  revalidatePath("/grocery");
  revalidatePath("/dashboard");
  return { ok: true, routed: true, isGrocery };
}
