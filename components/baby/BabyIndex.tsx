"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BabyToday } from "./BabyToday";
import { ShareLinks } from "./ShareLinks";
import { lastEventOf, useBabyLane } from "./useBabyLane";
import { createClient } from "@/lib/supabase/client";
import { formatAgo, formatClock, secondsBetween } from "@/lib/baby/format";
import type { ShareLink } from "@/lib/baby/events";

const CARDS = [
  { type: "feed", label: "Feed", emoji: "🍼", href: "/baby/feed" },
  { type: "diaper", label: "Diaper", emoji: "🧷", href: "/baby/diaper" },
  { type: "sleep", label: "Sleep", emoji: "😴", href: "/baby/sleep" },
  { type: "pump", label: "Pump", emoji: "🫙", href: "/baby/pump" },
  { type: "growth", label: "Growth", emoji: "📏", href: "/baby/growth" },
  { type: "contraction", label: "Contractions", emoji: "⏱️", href: "/baby/contractions" },
] as const;

/** Point events never end, so "running" is only ever true for a timer type. */
const TIMER_TYPES = new Set(["feed", "sleep", "pump", "contraction"]);

const BABY_SCOPES = ["contractions", "baby_today"];

/**
 * /baby — a stack of last-event cards, one per type, each the door to its page.
 *
 * The live elapsed time on a running card is the reason the restructure was
 * worth doing. `ended_at IS NULL` is the source of truth, so a timer started on
 * /baby/feed is still visibly running here after the app has been force-quit and
 * reopened — the clock is a database timestamp, not a setInterval that died with
 * the tab.
 */
export function BabyIndex({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [links, setLinks] = useState<ShareLink[]>([]);

  const anyRunning = lane.events.some(
    (e) => e.ended_at === null && TIMER_TYPES.has(e.event_type)
  );

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("baby_share_links")
      .select("*")
      .eq("family_id", familyId)
      // The table is shared with caregiver-shift links. Without this filter the
      // baby lane lists those too, with a Revoke button that would kill a
      // nanny's link from here.
      .in("scope", BABY_SCOPES)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setLinks((data ?? []) as ShareLink[]);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId, lane.events.length]);

  const visibleToday = lane.events.filter(
    (e) => e.event_type === "contraction" || lane.kidId === null || e.kid_id === lane.kidId
  );

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-stone-800">Baby</h1>
        {lane.kids.length > 1 && (
          <div className="flex gap-1.5">
            {lane.kids.map((k) => (
              <button
                key={k.id}
                type="button"
                data-testid={`baby-kid-${k.id}`}
                onClick={() => lane.chooseKid(k.id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  lane.kidId === k.id
                    ? "bg-stone-800 text-white"
                    : "bg-white text-stone-600 ring-1 ring-stone-200"
                }`}
              >
                {k.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {lane.failed && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Couldn&apos;t load the baby log. Check your connection and reload.
        </p>
      )}

      <ul className="space-y-2.5">
        {CARDS.map((card) => {
          const last = lastEventOf(lane.events, card.type, lane.kidId);
          const running = !!last && last.ended_at === null && TIMER_TYPES.has(card.type);
          return (
            <li key={card.type}>
              <Link
                href={card.href}
                data-testid={`baby-card-${card.type}`}
                data-running={running ? "true" : "false"}
                className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 ring-1 ${
                  running
                    ? "bg-rose-50 ring-rose-200"
                    : "bg-white ring-stone-200 active:bg-stone-50"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span aria-hidden className="text-2xl">
                    {card.emoji}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-stone-800">{card.label}</span>
                    <span className="block text-[11px] text-stone-500">
                      {running
                        ? "running"
                        : last
                          ? formatAgo(last.started_at, nowMs)
                          : "nothing logged yet"}
                    </span>
                  </span>
                </span>

                {running ? (
                  <span
                    data-testid={`baby-elapsed-${card.type}`}
                    className="font-mono text-lg tabular-nums text-rose-700"
                  >
                    {formatClock(secondsBetween(last.started_at, nowMs) ?? 0)}
                  </span>
                ) : (
                  <span aria-hidden className="text-stone-300">
                    ›
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <BabyToday events={visibleToday} onChanged={lane.refresh} />

      <ShareLinks familyId={familyId} links={links} onChanged={lane.refresh} />
    </div>
  );
}
