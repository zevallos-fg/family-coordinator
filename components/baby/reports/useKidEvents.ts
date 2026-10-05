"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ReportEvent } from "@/lib/baby/reports";

const PAGE = 1000;

/**
 * Sleep, feed and diaper entries for one child since `sinceMs`, fetched in
 * pages: PostgREST returns at most 1,000 rows a request, and a year of a
 * newborn's log is several thousand.
 */
export function useKidEvents(kidId: string | null, sinceMs: number | null) {
  const [state, setState] = useState<{ key: string; events: ReportEvent[]; failed: boolean } | null>(null);
  const key = `${kidId}:${sinceMs}`;

  useEffect(() => {
    if (!kidId || sinceMs === null) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const since = new Date(sinceMs).toISOString();
      const all: ReportEvent[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("baby_events")
          .select("id, event_type, started_at, ended_at, payload")
          .eq("kid_id", kidId)
          .in("event_type", ["sleep", "feed", "diaper"])
          .gte("started_at", since)
          .order("started_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error) {
          setState({ key, events: all, failed: true });
          return;
        }
        all.push(...((data ?? []) as ReportEvent[]));
        if (!data || data.length < PAGE) break;
      }
      if (!cancelled) setState({ key, events: all, failed: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [kidId, sinceMs, key]);

  const ready = state?.key === key;
  return { events: ready ? state.events : null, failed: ready ? state.failed : false };
}
