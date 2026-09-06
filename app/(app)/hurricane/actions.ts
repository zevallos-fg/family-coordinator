"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runHurricaneSkill } from "@/skills/family-hurricane-prep";
import { isChecklistSettled, type ChecklistStatus } from "@/lib/db/enums";
import type { Database } from "@/lib/supabase/database.types";

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

const HURRICANE_SEASON = "hurricane_2026";

export async function generateChecklist(): Promise<
  ActionResult<{ season_phase: string; items_count: number }>
> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    // Idempotent: check if items already exist for this season
    const { count } = await supabase
      .from("seasonal_checklists")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("season", HURRICANE_SEASON);

    if ((count ?? 0) > 0) {
      return err(
        "already_exists",
        "Checklist already generated. Mark items complete or clear them first.",
        `family ${familyId} already has ${count} items for ${HURRICANE_SEASON}`
      );
    }

    const skillResult = await withRetry(() =>
      runHurricaneSkill(
        {
          family_id: familyId,
          current_date: new Date().toISOString().split("T")[0],
          location: "miami_fl",
          household: { adults: 2, kids: 1, home_type: "single_family" },
        },
        { familyId, userId }
      )
    );

    if (!skillResult.ok || !skillResult.data) {
      Sentry.captureException(new Error(skillResult.error?.message ?? "skill failed"), {
        extra: { action: "generateChecklist" },
      });
      return err(
        "skill_error",
        "Could not generate checklist. Please try again.",
        skillResult.error?.message ?? "skill failed"
      );
    }

    const { season_phase, checklist_items } = skillResult.data;

    // Compute due dates from offset
    const today = new Date();
    // Annotated with the table's own Insert type rather than inferred: inside a
    // .map() with no contextual type, `status: "open" satisfies ChecklistStatus`
    // still widens to string and the enum buys nothing. This way the compiler
    // checks every column, not just the one we remembered to think about.
    const rows: Database["public"]["Tables"]["seasonal_checklists"]["Insert"][] =
      checklist_items.map((item) => {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + item.due_by_offset_days);
      return {
        family_id: familyId,
        item_text: `[${item.priority.toUpperCase()}][${item.category}] ${item.text}`,
        season: `${HURRICANE_SEASON}_${season_phase}`,
        // seasonal_checklists.status accepts open | done | na. This wrote
        // "pending", so generation could never store a single row: the whole
        // feature was inert from the first line it ever tried to insert.
        status: "open",
        due_by_date: dueDate.toISOString().split("T")[0],
        };
      });

    const { error: insertError } = await supabase
      .from("seasonal_checklists")
      .insert(rows);

    if (insertError) {
      Sentry.captureException(insertError, { extra: { action: "generateChecklist" } });
      return err("db_error", "Could not save checklist.", insertError.message);
    }

    revalidatePath("/hurricane");
    return ok({ season_phase, items_count: rows.length });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "generateChecklist" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function markItemDone(item_id: string): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthedFamily();

    const { error } = await supabase
      .from("seasonal_checklists")
      .update({ status: "done" satisfies ChecklistStatus, completed_at: new Date().toISOString() })
      .eq("id", item_id);

    if (error) {
      Sentry.captureException(error, { extra: { action: "markItemDone", item_id } });
      return err("db_error", "Could not mark item done.", error.message);
    }

    revalidatePath("/hurricane");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "markItemDone" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function markItemNA(item_id: string): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthedFamily();

    const { error } = await supabase
      .from("seasonal_checklists")
      .update({ status: "na" satisfies ChecklistStatus })
      .eq("id", item_id);

    if (error) {
      Sentry.captureException(error, { extra: { action: "markItemNA", item_id } });
      return err("db_error", "Could not mark item N/A.", error.message);
    }

    revalidatePath("/hurricane");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "markItemNA" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function getCurrentSeasonProgress(): Promise<
  ActionResult<{
    total: number;
    completed: number;
    critical_total: number;
    critical_completed: number;
    overall_pct: number;
    critical_pct: number;
    season_phase: string | null;
  }>
> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { data: items } = await supabase
      .from("seasonal_checklists")
      .select("id, item_text, status, season")
      .eq("family_id", familyId)
      .like("season", `${HURRICANE_SEASON}%`);

    if (!items || items.length === 0) {
      return ok({
        total: 0,
        completed: 0,
        critical_total: 0,
        critical_completed: 0,
        overall_pct: 0,
        critical_pct: 0,
        season_phase: null,
      });
    }

    // Both filters used to test for "completed"/"n_a" — values the column cannot
    // hold — so every percentage on this page was pinned regardless of progress.
    const done = items.filter((i) => isChecklistSettled(i.status));
    const critical = items.filter((i) => i.item_text.includes("[CRITICAL]"));
    const criticalDone = critical.filter((i) => isChecklistSettled(i.status));

    // Extract season phase from season field
    const seasonPhase = items[0]?.season.replace(`${HURRICANE_SEASON}_`, "") ?? null;

    return ok({
      total: items.length,
      completed: done.length,
      critical_total: critical.length,
      critical_completed: criticalDone.length,
      overall_pct: Math.round((done.length / items.length) * 100),
      critical_pct:
        critical.length > 0
          ? Math.round((criticalDone.length / critical.length) * 100)
          : 100,
      season_phase: seasonPhase,
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "getCurrentSeasonProgress" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
