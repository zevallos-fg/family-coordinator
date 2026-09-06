"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runMilestoneSkill } from "@/skills/family-kid-milestone";
import type { Output as MilestoneOutput } from "@/skills/family-kid-milestone";
import { parseMedicalEventType } from "@/lib/db/enums";

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

// Returns skill analysis for USER REVIEW — does NOT auto-save
export async function logMilestone(
  kid_id: string,
  formData: FormData
): Promise<ActionResult<{ skillOutput: MilestoneOutput; milestone_text: string }>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    const milestone_text = (formData.get("milestone_text") as string)?.trim();
    if (!milestone_text) {
      return err("invalid_input", "Milestone description is required.", "milestone_text empty");
    }

    // Get kid details
    const { data: kid } = await supabase
      .from("kids")
      .select("id, name, birth_date")
      .eq("id", kid_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!kid) return err("not_found", "Kid not found.", `kid ${kid_id} not in family`);

    // Calculate age in months
    const birthDate = kid.birth_date ? new Date(kid.birth_date) : null;
    const ageMonths = birthDate
      ? Math.floor(
          (new Date().getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
        )
      : 0;

    // Get recent milestones for context
    const { data: recentMilestones } = await supabase
      .from("kid_milestones")
      .select("logged_at, milestone_type, notes")
      .eq("kid_id", kid_id)
      .order("logged_at", { ascending: false })
      .limit(5);

    const skillResult = await withRetry(() =>
      runMilestoneSkill(
        {
          kid: {
            name: kid.name,
            birth_date: kid.birth_date ?? new Date().toISOString().split("T")[0],
            current_age_months: ageMonths,
          },
          milestone_text,
          recent_milestones: (recentMilestones ?? []).map((m) => ({
            logged_at: m.logged_at,
            milestone_type: m.milestone_type,
            notes: m.notes,
          })),
        },
        { familyId, userId }
      )
    );

    if (!skillResult.ok || !skillResult.data) {
      return err(
        "skill_error",
        "Could not analyze milestone. Please try again.",
        skillResult.error?.message ?? "skill failed"
      );
    }

    return ok({ skillOutput: skillResult.data, milestone_text });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "logMilestone" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

// Called after user reviews and confirms
export async function confirmAndSaveMilestone(
  kid_id: string,
  milestone_text: string,
  skillOutput: MilestoneOutput,
  notes?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { data, error } = await supabase
      .from("kid_milestones")
      .insert({
        family_id: familyId,
        kid_id,
        logged_at: new Date().toISOString(),
        milestone_type: skillOutput.milestone_type,
        notes: notes ?? `${skillOutput.normalized_description}${skillOutput.requires_pediatrician_followup ? " [FOLLOWUP]" : ""}`,
      })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "confirmAndSaveMilestone" } });
      return err("db_error", "Could not save milestone.", error.message);
    }

    revalidatePath(`/kids/${kid_id}/milestones`);
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "confirmAndSaveMilestone" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

// Medical events — straight CRUD, NO AI
export async function logMedicalEvent(
  kid_id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const event_date = (formData.get("event_date") as string)?.trim();
    const provider = (formData.get("provider") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    // Narrowed rather than trusted: event_type is CHECK-constrained, so a value
    // the column will refuse is caught here with a message instead of surfacing
    // as an opaque "Could not save medical event."
    const event_type = parseMedicalEventType(formData.get("event_type"));

    if (!event_date || !event_type) {
      return err(
        "invalid_input",
        "Event date and type are required.",
        `missing or unrecognised fields (event_type=${JSON.stringify(formData.get("event_type"))})`
      );
    }

    const { data, error } = await supabase
      .from("medical_events")
      .insert({ family_id: familyId, kid_id, event_date, event_type, provider, notes })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "logMedicalEvent" } });
      return err("db_error", "Could not save medical event.", error.message);
    }

    revalidatePath(`/kids/${kid_id}/medical`);
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "logMedicalEvent" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function editMilestone(
  id: string,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthedFamily();

    const notes = (formData.get("notes") as string)?.trim() || null;
    const milestone_type = (formData.get("milestone_type") as string)?.trim();

    const { error } = await supabase
      .from("kid_milestones")
      .update({ notes, milestone_type })
      .eq("id", id);

    if (error) {
      Sentry.captureException(error, { extra: { action: "editMilestone", id } });
      return err("db_error", "Could not update milestone.", error.message);
    }

    revalidatePath("/kids");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "editMilestone" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function deleteMilestone(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthedFamily();

    const { error } = await supabase
      .from("kid_milestones")
      .delete()
      .eq("id", id);

    if (error) {
      Sentry.captureException(error, { extra: { action: "deleteMilestone", id } });
      return err("db_error", "Could not delete milestone.", error.message);
    }

    revalidatePath("/kids");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "deleteMilestone" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
