"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ContractionTimer } from "./ContractionTimer";
import { toggleTimer } from "@/lib/baby/write";
import type { ContractionRow } from "@/lib/baby/events";

/**
 * /baby/contractions — the timer itself is kept exactly as built.
 *
 * It works, it has a deadline, and it is the one screen on this lane that will
 * be used under conditions where nothing should be unfamiliar. Only its
 * surroundings changed: it has a route of its own now, so it can be deep-linked
 * and reached from a launcher long-press instead of living two taps inside a
 * sheet.
 */
export function ContractionsPage({ familyId }: { familyId: string }) {
  const [rows, setRows] = useState<ContractionRow[]>([]);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [viewRes, openRes] = await Promise.all([
      supabase
        .from("v_contractions_recent")
        .select("*")
        .eq("family_id", familyId)
        .order("started_at", { ascending: false }),
      supabase
        .from("baby_events")
        .select("id, started_at")
        .eq("family_id", familyId)
        .eq("event_type", "contraction")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
    ]);

    const viewRows = (viewRes.data ?? []) as ContractionRow[];
    const running = openRes.data?.[0];

    // A contraction older than the view's 12-hour window is still running. Show
    // it rather than offer to start a second one on top of it.
    setRows(
      !running || viewRows.some((r) => r.id === running.id)
        ? viewRows
        : [
            {
              family_id: familyId,
              id: running.id,
              started_at: running.started_at,
              ended_at: null,
              duration_s: null,
              since_prev_s: null,
              in_progress: true,
            },
            ...viewRows,
          ]
    );
  }, [familyId]);

  useEffect(() => {
    // Async body for the same reason as useBabyLane: setRows must be provably
    // after an await, not synchronous inside the effect.
    void (async () => {
      await load();
    })();
  }, [load]);

  async function toggle() {
    setPending(true);
    // No kid id, deliberately: baby_events allows a null kid_id only for this
    // event type, which is what lets the timer work before the baby exists.
    const result = await toggleTimer({ familyId, type: "contraction" });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Link
          href="/baby"
          aria-label="Close"
          data-testid="baby-close"
          className="-ml-1 rounded-full p-2 text-stone-400 active:bg-stone-100"
        >
          <span aria-hidden className="text-xl leading-none">
            ✕
          </span>
        </Link>
        <h1 className="text-base font-medium text-stone-800">Contractions</h1>
        <span className="w-9" />
      </header>

      <ContractionTimer rows={rows} pending={pending} onToggle={toggle} />
    </div>
  );
}
