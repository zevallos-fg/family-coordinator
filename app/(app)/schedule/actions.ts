"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as scheduleReconciler from "@/skills/family-schedule-reconciler";
import type { Output } from "@/skills/family-schedule-reconciler";

export async function processScreenshot(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, families(timezone)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const imageFile = formData.get("image") as File | null;
  const weekOf = formData.get("weekOf") as string;

  if (!imageFile || imageFile.size === 0) {
    return { ok: false, error: "Please upload a calendar screenshot." };
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp"] as const;
  const mimeType = imageFile.type;
  if (!validTypes.includes(mimeType as (typeof validTypes)[number])) {
    return { ok: false, error: "Only JPEG, PNG, and WebP images are supported." };
  }

  // Convert to base64
  const bytes = await imageFile.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  // Fetch family members to know who is in the schedule
  const { data: members } = await supabase
    .from("family_members")
    .select("users(full_name)")
    .eq("family_id", membership.family_id);

  const knownNames = (members ?? [])
    .map((m) => (m.users as { full_name: string | null } | null)?.full_name)
    .filter(Boolean) as string[];

  if (knownNames.length === 0) knownNames.push("Fernando", "Yenny");

  const result = await withSkillContext(scheduleReconciler.run, {
    imageBase64: base64,
    imageMimeType: mimeType === "image/png" ? "image/png" : "image/jpeg",
    weekOf: weekOf || new Date().toISOString().slice(0, 10),
    knownNames,
  });

  if (!result.ok) {
    return { ok: false, error: result.error?.message ?? "Analysis failed." };
  }

  return { ok: true, data: result.data };
}

export async function saveReconciliation(reconciliation: Output) {
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

  // Build rows to insert — one per duty per day
  const rows = reconciliation.days.flatMap((day) => {
    const base = { family_id: membership.family_id, date: day.date };
    const duties: Array<{ duty_type: string; notes: string }> = [
      { duty_type: "dropoff", notes: day.duties.dropoff.assignee },
      { duty_type: "pickup", notes: day.duties.pickup.assignee },
    ];
    if (day.duties.nap) {
      duties.push({ duty_type: "nap", notes: day.duties.nap.assignee });
    }
    return duties.map((d) => ({ ...base, ...d }));
  });

  if (rows.length === 0) return { ok: true };

  // Delete existing entries for these dates then insert fresh
  const dates = [...new Set(rows.map((r) => r.date))];
  await supabase
    .from("schedule_entries")
    .delete()
    .eq("family_id", membership.family_id)
    .in("date", dates);

  const { error } = await supabase.from("schedule_entries").insert(rows);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Check whether any schedule_entries exist for a set of ISO dates (family-scoped).
export async function checkDatesHaveDuties(dates: string[]): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return false;

  const { count } = await supabase
    .from("schedule_entries")
    .select("id", { count: "exact", head: true })
    .eq("family_id", membership.family_id)
    .in("date", dates);

  return (count ?? 0) > 0;
}

export async function deleteEntry(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("schedule_entries")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}
