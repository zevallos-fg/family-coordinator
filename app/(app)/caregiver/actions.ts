"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { toTitleCase } from "@/lib/format/titleCase";
import { parseCaregiverRole, CAREGIVER_ROLES } from "@/lib/db/enums";
import { shareRpc } from "@/lib/caregiver-share";
import { withSkillContext } from "@/lib/skill-action";
import { run as runBriefSkill } from "@/skills/family-caregiver-brief";
import { run as runRecapSkill } from "@/skills/family-caregiver-recap";
import { run as runKidStateSkill } from "@/skills/family-kid-state";

async function getAuthedFamily() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const { data: membership, error } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !membership) throw new Error("no family found");
  return { supabase, userId: user.id, familyId: membership.family_id };
}

// ─── Caregivers ──────────────────────────────────────────────────────────────

export async function createCaregiver(formData: FormData) {
  const { supabase, familyId } = await getAuthedFamily();

  const name = formData.get("name") as string;
  const role = formData.get("role") as string;
  const email = formData.get("email") as string | null;
  const phone = formData.get("phone") as string | null;
  const notes = formData.get("notes") as string | null;

  // Title-casing the ROLE is what broke this action for every caregiver ever
  // added: caregivers.role is CHECK-constrained to lowercase values, so `Nanny`
  // was refused and the throw below rendered a blank server-error page. Display
  // casing lives in CAREGIVER_ROLE_LABEL and nowhere near the stored value.
  // The NAME is a proper noun and is still title-cased — that part was fine.
  const storedRole = parseCaregiverRole(role);
  if (!storedRole) {
    throw new Error(
      `role must be one of ${CAREGIVER_ROLES.join(", ")} (received ${JSON.stringify(role)})`
    );
  }

  const { error } = await supabase.from("caregivers").insert({
    family_id: familyId,
    name: toTitleCase(name.trim()),
    role: storedRole,
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    notes: notes?.trim() || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
  redirect("/caregiver/caregivers");
}

export async function updateCaregiver(id: string, formData: FormData) {
  const { supabase, familyId } = await getAuthedFamily();

  const editedRole = parseCaregiverRole(formData.get("role"));
  if (!editedRole) {
    throw new Error(
      `role must be one of ${CAREGIVER_ROLES.join(", ")} (received ${JSON.stringify(formData.get("role"))})`
    );
  }

  const { error } = await supabase
    .from("caregivers")
    .update({
      name: toTitleCase((formData.get("name") as string).trim()),
      role: editedRole,
      email: (formData.get("email") as string | null)?.trim() || null,
      phone: (formData.get("phone") as string | null)?.trim() || null,
      notes: (formData.get("notes") as string | null)?.trim() || null,
    })
    .eq("id", id)
    .eq("family_id", familyId);

  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
  redirect("/caregiver/caregivers");
}

export async function deleteCaregiver(id: string) {
  const { supabase, familyId } = await getAuthedFamily();
  const { error } = await supabase
    .from("caregivers")
    .delete()
    .eq("id", id)
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
}

// ─── Kids ─────────────────────────────────────────────────────────────────────

const toArray = (raw: FormDataEntryValue | null) =>
  raw
    ? String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

export async function createKid(formData: FormData) {
  const { supabase, familyId } = await getAuthedFamily();

  const { error } = await supabase.from("kids").insert({
    family_id: familyId,
    name: (formData.get("name") as string).trim(),
    birth_date: (formData.get("birth_date") as string | null) || null,
    notes: (formData.get("notes") as string | null)?.trim() || null,
    food_favorites: toArray(formData.get("food_favorites")),
    food_aversions: toArray(formData.get("food_aversions")),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
  redirect("/caregiver/kids");
}

export async function updateKid(id: string, formData: FormData) {
  const { supabase, familyId } = await getAuthedFamily();

  const { error } = await supabase
    .from("kids")
    .update({
      name: (formData.get("name") as string).trim(),
      birth_date: (formData.get("birth_date") as string | null) || null,
      notes: (formData.get("notes") as string | null)?.trim() || null,
      food_favorites: toArray(formData.get("food_favorites")),
      food_aversions: toArray(formData.get("food_aversions")),
    })
    .eq("id", id)
    .eq("family_id", familyId);

  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
  redirect("/caregiver/kids");
}

export async function updateKidFromObservation(
  kidId: string,
  observation: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, familyId } = await getAuthedFamily();

  const { data: kid } = await supabase
    .from("kids")
    .select("name, notes, food_favorites, food_aversions")
    .eq("id", kidId)
    .eq("family_id", familyId)
    .single();

  if (!kid) return { ok: false, error: "Kid not found" };

  const result = await withSkillContext(runKidStateSkill, {
    kidName: kid.name,
    currentNotes: kid.notes ?? "",
    currentFoodFavorites: kid.food_favorites ?? [],
    currentFoodAversions: kid.food_aversions ?? [],
    newObservation: observation,
    observationDate: new Date().toISOString().split("T")[0],
  });

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error?.message ?? "Update failed" };
  }

  const { error } = await supabase
    .from("kids")
    .update({
      notes: result.data.updatedNotes,
      food_favorites: result.data.updatedFoodFavorites,
      food_aversions: result.data.updatedFoodAversions,
    })
    .eq("id", kidId)
    .eq("family_id", familyId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/caregiver");
  return { ok: true };
}

export async function deleteKid(id: string) {
  const { supabase, familyId } = await getAuthedFamily();
  const { error } = await supabase
    .from("kids")
    .delete()
    .eq("id", id)
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export async function createShift(formData: FormData) {
  const { supabase, familyId } = await getAuthedFamily();

  const kidNames = toArray(formData.get("kid_names"));

  const { data: shift, error } = await supabase
    .from("caregiver_shifts")
    .insert({
      family_id: familyId,
      caregiver_id: formData.get("caregiver_id") as string,
      kid_names: kidNames,
      start_at: formData.get("start_at") as string,
      end_at: formData.get("end_at") as string,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
  redirect(`/caregiver/shifts/${shift.id}`);
}

export async function deleteShift(id: string) {
  const { supabase, familyId } = await getAuthedFamily();
  const { error } = await supabase
    .from("caregiver_shifts")
    .delete()
    .eq("id", id)
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  revalidatePath("/caregiver");
}

// ─── Brief generation ─────────────────────────────────────────────────────────

export async function generateBrief(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, familyId } = await getAuthedFamily();

  const { data: shift, error: shiftErr } = await supabase
    .from("caregiver_shifts")
    .select("*, caregivers(name, role)")
    .eq("id", shiftId)
    .eq("family_id", familyId)
    .single();

  if (shiftErr || !shift) return { ok: false, error: "Shift not found" };

  const kidNames: string[] = shift.kid_names ?? [];
  let kidsData: Array<{
    name: string;
    birth_date: string | null;
    notes: string | null;
    food_favorites: string[] | null;
    food_aversions: string[] | null;
  }> = [];

  if (kidNames.length > 0) {
    const { data: kids } = await supabase
      .from("kids")
      .select("name, birth_date, notes, food_favorites, food_aversions")
      .eq("family_id", familyId)
      .in("name", kidNames);
    kidsData = kids ?? [];
  }

  const { data: lastRecap } = await supabase
    .from("shift_recaps")
    .select("transcription, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: openTasks } = await supabase
    .from("tasks")
    .select("title, due_at")
    .eq("family_id", familyId)
    .is("completed_at", null)
    .limit(5);

  const caregiverInfo = shift.caregivers as { name: string; role: string } | null;

  const result = await withSkillContext(runBriefSkill, {
    caregiver: {
      name: caregiverInfo?.name ?? "Caregiver",
      role: caregiverInfo?.role ?? "caregiver",
    },
    kids: kidsData.map((k) => ({
      name: k.name,
      birthDate: k.birth_date,
      notes: k.notes ?? "",
      foodFavorites: k.food_favorites ?? [],
      foodAversions: k.food_aversions ?? [],
    })),
    shift: { startAt: shift.start_at, endAt: shift.end_at },
    openTasks: (openTasks ?? []).map((t) => ({
      title: t.title,
      dueDate: t.due_at ?? undefined,
    })),
    previousRecap: lastRecap?.transcription ?? undefined,
  });

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error?.message ?? "Brief generation failed" };
  }

  // Remove old brief and insert fresh. The delete's error is read: leaving the
  // previous brief in place would mean the caregiver reads yesterday's notes
  // while the screen says the brief was regenerated.
  const { error: clearErr } = await supabase
    .from("shift_briefs")
    .delete()
    .eq("shift_id", shiftId);
  if (clearErr) return { ok: false, error: clearErr.message };

  const { error: insertErr } = await supabase.from("shift_briefs").insert({
    shift_id: shiftId,
    content: result.data.content,
  });

  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath(`/caregiver/shifts/${shiftId}`);
  return { ok: true };
}

// ─── Recap parsing (parent-triggered, authenticated) ──────────────────────────

export async function parseRecap(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, familyId } = await getAuthedFamily();

  const { data: shift } = await supabase
    .from("caregiver_shifts")
    .select("start_at, end_at, kid_names, family_id")
    .eq("id", shiftId)
    .eq("family_id", familyId)
    .single();

  if (!shift) return { ok: false, error: "Shift not found" };

  const { data: recap } = await supabase
    .from("shift_recaps")
    .select("id, transcription")
    .eq("shift_id", shiftId)
    .single();

  if (!recap?.transcription) return { ok: false, error: "No recap text to parse" };

  const kidName = shift.kid_names?.[0] ?? "the child";

  const recapResult = await withSkillContext(runRecapSkill, {
    kidName,
    shiftTimes: { startAt: shift.start_at, endAt: shift.end_at },
    caregiverText: recap.transcription,
  });

  if (!recapResult.ok || !recapResult.data) {
    return { ok: false, error: recapResult.error?.message ?? "Parse failed" };
  }

  const { error: recapUpdateErr } = await supabase
    .from("shift_recaps")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ structured_log: recapResult.data.structuredData as any })
    .eq("id", recap.id);

  // The parse is the whole point of the action; silently keeping the raw text
  // would look identical to never having pressed the button.
  if (recapUpdateErr) return { ok: false, error: recapUpdateErr.message };

  // Update kid state from recap
  if (shift.kid_names && shift.kid_names.length > 0) {
    const { data: kid } = await supabase
      .from("kids")
      .select("id, name, notes, food_favorites, food_aversions")
      .eq("family_id", familyId)
      .eq("name", kidName)
      .maybeSingle();

    if (kid) {
      const kidStateResult = await withSkillContext(runKidStateSkill, {
        kidName: kid.name,
        currentNotes: kid.notes ?? "",
        currentFoodFavorites: kid.food_favorites ?? [],
        currentFoodAversions: kid.food_aversions ?? [],
        newObservation: recap.transcription,
        observationDate: new Date().toISOString().split("T")[0],
      });

      if (kidStateResult.ok && kidStateResult.data) {
        const { error: kidErr } = await supabase
          .from("kids")
          .update({
            notes: kidStateResult.data.updatedNotes,
            food_favorites: kidStateResult.data.updatedFoodFavorites,
            food_aversions: kidStateResult.data.updatedFoodAversions,
          })
          .eq("id", kid.id)
          .eq("family_id", familyId);

        // Secondary to the recap parse, which has already succeeded — so this
        // does not fail the action, but it stops being invisible.
        if (kidErr) {
          console.error("[parseRecap] kid state update failed", {
            kidId: kid.id,
            error: kidErr.message,
          });
        }
      }
    }
  }

  revalidatePath(`/caregiver/shifts/${shiftId}`);
  return { ok: true };
}

// ─── Caregiver share links ───────────────────────────────────────────────────

/**
 * Mint a link a caregiver can actually open.
 *
 * Replaces submitRecap and the raw-shift-UUID URL it went with. That pair carried
 * a note saying "RLS on shift_recaps must allow anon insert" — it never did, so
 * the public page 404'd for every caregiver and the recap form could not save.
 *
 * fn_share_create is NOT security definer: the insert is checked by the share
 * table's own RLS, so this can only mint links for the caller's own family, and
 * the function verifies the shift belongs to that family rather than trusting the
 * pair it was handed.
 */
export async function createShiftShareLink(
  shiftId: string,
  hours = 72
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: string }> {
  const { supabase, familyId } = await getAuthedFamily();

  const { data: shift, error: shiftError } = await supabase
    .from("caregiver_shifts")
    .select("id, caregivers(name)")
    .eq("id", shiftId)
    .eq("family_id", familyId)
    .maybeSingle();

  if (shiftError) return { ok: false, error: shiftError.message };
  if (!shift) return { ok: false, error: "Shift not found." };

  const caregiverName =
    (shift.caregivers as { name: string } | null)?.name ?? "Caregiver";

  const { data, error } = await shareRpc(supabase).rpc("fn_share_create", {
    p_family_id: familyId,
    p_label: caregiverName,
    p_scope: "caregiver_shift",
    p_hours: hours,
    p_shift_id: shiftId,
  });

  const row = data?.[0];
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Could not create the link." };
  }

  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  return {
    ok: true,
    url: `${origin}/caregiver-view/${row.token}`,
    expiresAt: row.expires_at,
  };
}
