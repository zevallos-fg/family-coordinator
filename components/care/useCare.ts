"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { Nutrients } from "@/lib/care/nutrition";

export type CareLog = Database["public"]["Tables"]["care_logs"]["Row"];
export type CareMed = Database["public"]["Views"]["v_care_medication_status"]["Row"];
export type CareProfile = Database["public"]["Tables"]["care_profiles"]["Row"];
export type FoodGoals = { kcal: number | null; overrides: Nutrients | null; note?: string | null };

const NO_GOALS: FoodGoals = { kcal: null, overrides: null };

/** One person's last 30 days of logs, their medicines, care profile and food goals. */
export function useCare(personId: string | null) {
  const [state, setState] = useState<{
    key: string | null;
    logs: CareLog[];
    meds: CareMed[];
    profile: CareProfile | null;
    goals: FoodGoals;
    failed: boolean;
  }>({ key: null, logs: [], meds: [], profile: null, goals: NO_GOALS, failed: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const today = new Date();
      const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const [logs, meds, profile, goals] = await Promise.all([
        supabase.from("care_logs").select("*").eq("person_user_id", personId).gte("at", since).order("at", { ascending: false }).limit(1000),
        supabase.from("v_care_medication_status").select("*").eq("person_user_id", personId).order("created_at"),
        supabase.from("care_profiles").select("*").eq("person_user_id", personId).maybeSingle(),
        // Goals are appended with a start date; the latest one in effect wins.
        supabase
          .from("person_nutrition_targets")
          .select("daily_kcal_target, micronutrient_targets, notes")
          .eq("user_id", personId)
          .lte("start_date", localToday)
          .order("start_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      const g = goals.data?.[0];
      if (cancelled) return;
      setState({
        key: personId,
        logs: (logs.data ?? []) as CareLog[],
        meds: (meds.data ?? []) as CareMed[],
        profile: (profile.data ?? null) as CareProfile | null,
        goals: g ? { kcal: g.daily_kcal_target, overrides: (g.micronutrient_targets ?? null) as Nutrients | null, note: g.notes } : NO_GOALS,
        failed: !!(logs.error || meds.error || profile.error || goals.error),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [personId, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const ready = state.key === personId;
  return {
    loading: !ready,
    logs: ready ? state.logs : [],
    meds: ready ? state.meds : [],
    profile: ready ? state.profile : null,
    goals: ready ? state.goals : NO_GOALS,
    failed: ready && state.failed,
    refresh,
  };
}
