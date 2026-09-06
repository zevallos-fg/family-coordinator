"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as scheduleReconciler from "@/skills/family-schedule-reconciler";
import type { Output } from "@/skills/family-schedule-reconciler";
import { requireFamily, lookupFamily } from "@/lib/auth/current-family";

export async function processScreenshot(formData: FormData) {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

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
  const { data: members, error: membersError } = await supabase
    .from("family_members")
    .select("users(full_name)")
    .eq("family_id", familyId);

  // These names are what the model matches calendar entries against, and the
  // result is written straight into schedule_entries. A failed read used to fall
  // through `?? []` to a hardcoded ["Fernando", "Yenny"] — so a transient error
  // produced a week of duties attributed to two people it had guessed, for any
  // family, with nothing on screen to say so.
  if (membersError) {
    return {
      ok: false,
      error: "Couldn't read who is in your family, so the schedule would be assigned to the wrong people. Nothing was changed.",
    };
  }

  const knownNames = (members ?? [])
    .map((m) => (m.users as { full_name: string | null } | null)?.full_name)
    .filter(Boolean) as string[];

  if (knownNames.length === 0) {
    return {
      ok: false,
      error: "No family members have a name set yet, so there is nobody to assign duties to. Add names in Settings first.",
    };
  }

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
  const { familyId } = await requireFamily();

  // Build rows to insert — one per duty per day
  const rows = reconciliation.days.flatMap((day) => {
    const base = { family_id: familyId, date: day.date };
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
  const { error: clearError } = await supabase
    .from("schedule_entries")
    .delete()
    .eq("family_id", familyId)
    .in("date", dates);

  // A failed clear followed by a successful insert duplicates every duty for
  // those dates, and the week view shows each one twice.
  if (clearError) {
    return { ok: false, error: clearError.message };
  }

  const { error } = await supabase.from("schedule_entries").insert(rows);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Does this week already have duties? The answer decides whether saving asks
 * before replacing them.
 *
 * It used to return a bare boolean, and every failure — no session, no family,
 * a failed membership read, a failed count — returned `false`, which the caller
 * reads as "nothing here to lose" and saves without asking. A blink of the
 * database was therefore enough to overwrite a week of duties with no
 * confirmation and nothing on screen to say it had happened.
 *
 * Three states, not two. "I could not check" is not "there is nothing there",
 * and the caller asks first when it does not know.
 */
export type DutiesCheck = "has-duties" | "empty" | "unknown";

export async function checkDatesHaveDuties(dates: string[]): Promise<DutiesCheck> {
  const supabase = await createClient();

  const family = await lookupFamily();
  if (!family.ok) return family.reason === "lookup-failed" ? "unknown" : "empty";

  const { count, error } = await supabase
    .from("schedule_entries")
    .select("id", { count: "exact", head: true })
    .eq("family_id", family.familyId)
    .in("date", dates);

  if (error) return "unknown";
  return (count ?? 0) > 0 ? "has-duties" : "empty";
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
