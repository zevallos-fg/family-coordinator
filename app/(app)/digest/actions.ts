"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runDigestSkill } from "@/skills/family-weekly-digest";
import type { BlindSpot } from "@/skills/family-weekly-digest";
import { type ChecklistStatus, type TaskStatus } from "@/lib/db/enums";

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

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export async function generateDigest(
  week_start_date: string
): Promise<ActionResult<{ id: string; week_start_date: string }>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    // Pull all input data for the week
    const weekEnd = new Date(week_start_date);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    const [membersRes, capturesRes, scheduleRes, expensesRes, tasksRes, milestonesRes, birthdaysRes, caregiverRes, seasonalRes] =
      await Promise.all([
        supabase.from("family_members").select("user_id, users(full_name)").eq("family_id", familyId),
        supabase
          .from("captures")
          .select("text, created_at")
          .eq("family_id", familyId)
          .gte("created_at", week_start_date)
          .lte("created_at", weekEndStr + "T23:59:59Z"),
        supabase
          .from("schedule_entries")
          .select("duty_type, date")
          .eq("family_id", familyId)
          .gte("date", week_start_date)
          .lte("date", weekEndStr),
        supabase
          .from("expenses")
          .select("amount_cents, merchant, category")
          .eq("family_id", familyId)
          .gte("purchased_at", week_start_date)
          .lte("purchased_at", weekEndStr),
        supabase
          .from("tasks")
          .select("title, status, completed_at")
          .eq("family_id", familyId),
        supabase
          .from("kid_milestones")
          .select("milestone_type, notes, kids(name)")
          .eq("family_id", familyId)
          .gte("logged_at", week_start_date)
          .lte("logged_at", weekEndStr + "T23:59:59Z"),
        supabase
          .from("kid_birthday_events")
          .select("party_date, host_name, kids(name)")
          .eq("family_id", familyId)
          .gte("party_date", week_start_date)
          .lte("party_date", weekEndStr),
        supabase
          .from("caregiver_shifts")
          .select("id")
          .eq("family_id", familyId)
          // The column is start_at, not shift_date. Filtering on a column that
          // does not exist made PostgREST return an error, and `.data ?? []`
          // turned that into "no shifts this week", every week.
          .gte("start_at", week_start_date)
          .lte("start_at", weekEndStr + "T23:59:59Z"),
        supabase
          .from("seasonal_checklists")
          .select("id")
          .eq("family_id", familyId)
          // "pending" is not a value this column can hold, so the outstanding
          // hurricane count was always zero.
          .eq("status", "open" satisfies ChecklistStatus),
      ]);

    // These reads feed the digest's numbers. A failed one used to vanish into a
    // `?? []` and read as "nothing happened this week", which is indistinguishable
    // from a quiet week and considerably less true.
    const readFailures = [
      ["family_members", membersRes],
      ["captures", capturesRes],
      ["schedule_entries", scheduleRes],
      ["expenses", expensesRes],
      ["tasks", tasksRes],
      ["kid_milestones", milestonesRes],
      ["kid_birthday_events", birthdaysRes],
      ["caregiver_shifts", caregiverRes],
      ["seasonal_checklists", seasonalRes],
    ].filter(([, res]) => (res as { error: unknown }).error);

    if (readFailures.length > 0) {
      const detail = readFailures
        .map(([name, res]) => `${name}: ${(res as { error: { message: string } }).error.message}`)
        .join("; ");
      Sentry.captureException(new Error(`digest read failed — ${detail}`), {
        extra: { action: "generateDigest", week_start_date },
      });
      return err(
        "db_error",
        "Could not read this week's activity, so the digest would be wrong.",
        detail
      );
    }

    const family_members = (membersRes.data ?? []).map((m) => ({
      user_id: m.user_id,
      name: (m.users as { full_name: string | null } | null)?.full_name ?? "Member",
    }));

    const captures = (capturesRes.data ?? []).map((c) => ({
      text: c.text,
      created_at: c.created_at,
    }));

    const schedule_entries = (scheduleRes.data ?? []).map((s) => ({
      title: s.duty_type,
      date: s.date,
    }));

    // Found by the compiler the moment tasks.status became an enum: both of these
    // compared against "completed", which is not one of the four values the
    // column has ever held. So every weekly digest reported no completed tasks at
    // all, and listed the done ones among the open ones.
    const completed_tasks = (tasksRes.data ?? [])
      .filter((t) => t.status === "done" && (t.completed_at ?? "") >= week_start_date)
      .map((t) => t.title);

    const open_tasks = (tasksRes.data ?? [])
      .filter((t) => t.status !== "done" && t.status !== "cancelled")
      .map((t) => t.title)
      .slice(0, 10);

    const kid_milestones = (milestonesRes.data ?? []).map((m) => ({
      kid_name: (m.kids as { name: string } | null)?.name ?? "Unknown",
      type: m.milestone_type,
      description: m.notes ?? m.milestone_type,
    }));

    const upcoming_birthdays = (birthdaysRes.data ?? []).map((b) => ({
      kid_name: (b.kids as { name: string } | null)?.name ?? "Unknown",
      party_date: b.party_date,
      host_name: b.host_name,
    }));

    const skillResult = await withRetry(() =>
      runDigestSkill(
        {
          week_start_date,
          family_members,
          captures,
          schedule_entries,
          expenses: (expensesRes.data ?? []).map((e) => ({
            amount_cents: e.amount_cents,
            merchant: e.merchant,
            category: e.category,
          })),
          completed_tasks,
          open_tasks,
          kid_milestones,
          upcoming_birthdays,
          caregiver_shifts: caregiverRes.data?.length ?? 0,
          seasonal_items_open: seasonalRes.data?.length ?? 0,
        },
        { familyId, userId }
      )
    );

    if (!skillResult.ok || !skillResult.data) {
      Sentry.captureException(new Error(skillResult.error?.message ?? "digest failed"), {
        extra: { action: "generateDigest" },
      });
      return err("skill_error", "Could not generate digest. Please try again.", skillResult.error?.message ?? "skill failed");
    }

    const { summary, sections, blind_spots, load_attribution } = skillResult.data;

    // Store structured output as JSON in the content column so the render
    // layer can consume sections[] and load_attribution without a migration.
    const content = JSON.stringify({ summary, sections, load_attribution });

    const { data: digest, error: insertError } = await supabase
      .from("digests")
      .insert({
        family_id: familyId,
        week_start_date,
        content,
        blind_spots: blind_spots as unknown as import("@/lib/supabase/database.types").Json,
      })
      .select("id")
      .single();

    if (insertError) {
      Sentry.captureException(insertError, { extra: { action: "generateDigest" } });
      return err("db_error", "Could not save digest.", insertError.message);
    }

    revalidatePath("/digest");
    return ok({ id: digest.id, week_start_date });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "generateDigest" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function regenerateDigest(
  digest_id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    // Get existing digest to get week_start_date
    const { data: existing } = await supabase
      .from("digests")
      .select("week_start_date")
      .eq("id", digest_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!existing) return err("not_found", "Digest not found.", `digest ${digest_id} not found`);

    // Delete old digest. Read the error: a failed delete followed by a
    // successful generate leaves two digests for one week, and the page picks
    // whichever it happens to read first.
    const { error: deleteError } = await supabase
      .from("digests")
      .delete()
      .eq("id", digest_id)
      .eq("family_id", familyId);

    if (deleteError) {
      Sentry.captureException(deleteError, { extra: { action: "regenerateDigest", digest_id } });
      return err("db_error", "Could not clear the old digest.", deleteError.message);
    }

    // Generate new
    const result = await generateDigest(existing.week_start_date);
    return result as ActionResult<{ id: string }>;
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "regenerateDigest" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function markDigestSent(
  digest_id: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { error } = await supabase
      .from("digests")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", digest_id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "markDigestSent", digest_id } });
      return err("db_error", "Could not mark digest sent.", error.message);
    }

    revalidatePath("/digest");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "markDigestSent" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function convertBlindSpotToTask(
  digest_id: string,
  blind_spot_index: number
): Promise<ActionResult<{ task_id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { data: digest } = await supabase
      .from("digests")
      .select("blind_spots")
      .eq("id", digest_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!digest) return err("not_found", "Digest not found.", `digest ${digest_id} not found`);

    const blindSpots = digest.blind_spots as unknown as BlindSpot[];
    const spot = blindSpots?.[blind_spot_index];
    if (!spot) return err("not_found", "Blind spot not found.", `index ${blind_spot_index} out of range`);

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        family_id: familyId,
        title: spot.suggested_action,
        description: `From weekly digest blind spot: ${spot.observation}`,
        // tasks.status accepts open | in_progress | done | cancelled.
        status: "open" satisfies TaskStatus,
      })
      .select("id")
      .single();

    if (taskError) {
      Sentry.captureException(taskError, { extra: { action: "convertBlindSpotToTask" } });
      return err("db_error", "Could not create task.", taskError.message);
    }

    revalidatePath("/digest");
    return ok({ task_id: task.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "convertBlindSpotToTask" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
