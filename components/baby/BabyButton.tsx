"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EVENT_LABEL } from "@/lib/baby/events";
import { formatClock, secondsBetween } from "@/lib/baby/format";

type Running = { type: string; startedAt: string } | null;

/**
 * `ended_at IS NULL` is the source of truth, not local state — so this asks the
 * database, not a ref that died when the tab was killed.
 */
async function loadRunning(familyId: string): Promise<Running> {
  const supabase = createClient();
  const { data } = await supabase
    .from("baby_events")
    .select("event_type, started_at")
    .eq("family_id", familyId)
    .in("event_type", ["feed", "sleep", "pump", "contraction"])
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1);

  const row = data?.[0];
  return row ? { type: row.event_type, startedAt: row.started_at } : null;
}

/**
 * The baby lane's front door, sitting above the fold on /now.
 *
 * A link to /baby rather than a sheet trigger. The lane is routes now: they can
 * be deep-linked, they survive being dismissed, and a launcher long-press can
 * land straight on a running timer. The live badge stays, because the one thing
 * a timer has to survive is the app being closed.
 */
export function BabyButton({ familyId }: { familyId: string }) {
  const [running, setRunning] = useState<Running>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    loadRunning(familyId).then((next) => {
      if (!cancelled) setRunning(next);
    });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
      <Link
        href="/baby"
        data-testid="baby-open"
        className="mb-5 flex w-full items-center justify-between rounded-2xl bg-rose-50 px-4 py-3.5 text-left ring-1 ring-rose-100 active:bg-rose-100"
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="text-lg">
            👶
          </span>
          <span>
            <span className="block text-sm font-medium text-stone-800">Baby</span>
            <span className="block text-[11px] text-stone-500">
              {running
                ? `${EVENT_LABEL[running.type] ?? running.type} running`
                : "Contractions, feeds, diapers, sleep"}
            </span>
          </span>
        </span>

        {running ? (
          <span className="font-mono text-lg tabular-nums text-rose-700">
            {formatClock(secondsBetween(running.startedAt, nowMs) ?? 0)}
          </span>
        ) : (
          <span aria-hidden className="text-stone-300">
            ›
          </span>
        )}
      </Link>
  );
}
