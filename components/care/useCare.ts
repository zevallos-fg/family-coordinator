"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type CareLog = Database["public"]["Tables"]["care_logs"]["Row"];
export type CareMed = Database["public"]["Views"]["v_care_medication_status"]["Row"];
export type CareProfile = Database["public"]["Tables"]["care_profiles"]["Row"];

/** One person's last 30 days of logs, their medicines and their care profile. */
export function useCare(personId: string | null) {
  const [state, setState] = useState<{
    key: string | null;
    logs: CareLog[];
    meds: CareMed[];
    profile: CareProfile | null;
    failed: boolean;
  }>({ key: null, logs: [], meds: [], profile: null, failed: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [logs, meds, profile] = await Promise.all([
        supabase.from("care_logs").select("*").eq("person_user_id", personId).gte("at", since).order("at", { ascending: false }).limit(1000),
        supabase.from("v_care_medication_status").select("*").eq("person_user_id", personId).order("created_at"),
        supabase.from("care_profiles").select("*").eq("person_user_id", personId).maybeSingle(),
      ]);
      if (cancelled) return;
      setState({
        key: personId,
        logs: (logs.data ?? []) as CareLog[],
        meds: (meds.data ?? []) as CareMed[],
        profile: (profile.data ?? null) as CareProfile | null,
        failed: !!(logs.error || meds.error || profile.error),
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
    failed: ready && state.failed,
    refresh,
  };
}
