"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BabyToday } from "./BabyToday";
import { ShareLinks } from "./ShareLinks";
import { lastEventOf, useBabyLane } from "./useBabyLane";
import { createClient } from "@/lib/supabase/client";
import { formatAgo, formatClock, formatDuration, secondsBetween } from "@/lib/baby/format";
import { eventDuration, eventSummary, todayTotals } from "@/lib/baby/summary";
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
 * "3h 12m ago · 1h 40m", or the live clock while it is running.
 *
 * markNextSide is on for feeds so the card carries the star: which side to start
 * on next is the single most useful thing this screen can say, and it is the one
 * thing nobody can reconstruct from memory.
 */
function detailLine(
  last: { started_at: string; ended_at: string | null; event_type: string; payload: unknown } | null,
  running: boolean,
  nowMs: number
): string {
  if (!last) return "no entries yet";
  const ago = formatAgo(last.started_at, nowMs);
  const summary = eventSummary(last.event_type, last.payload as Record<string, unknown>, {
    markNextSide: last.event_type === "feed",
  });
  if (running) return summary ? `running · ${summary}` : "running";
  const duration = eventDuration(last.started_at, last.ended_at);
  return [ago, duration, summary].filter(Boolean).join(" · ");
}

/**
 * /baby — a dashboard, not a menu.
 *
 * Every card answers "how is she doing" without a tap: time since the last one,
 * and the salient detail of that last one. "Feeding · 47m ago" answers nothing a
 * parent asks at 4am; "47m ago · (L) 10m, (R*) 13m" answers all of it — how
 * long, which sides, and where to start next.
 *
 * Types with no entries keep their card and say so. On this screen an absence is
 * information: "no entries yet" under Diaper at 6pm is the thing you needed to
 * know, and a card that vanished would have hidden it.
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

  const visibleForKid = lane.events.filter(
    (e) => e.event_type === "contraction" || lane.kidId === null || e.kid_id === lane.kidId
  );

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

  const totals = todayTotals(visibleForKid, nowMs);

  const visibleToday = visibleForKid;

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

      {/* The today strip: what a parent is asked for at a handover or an
          appointment, and the reason this page is not a menu. */}
      <dl className="grid grid-cols-3 gap-2" data-testid="baby-today-strip">
        {[
          { label: "Feeds", value: String(totals.feeds), testId: "today-feeds" },
          { label: "Diapers", value: String(totals.diapers), testId: "today-diapers" },
          {
            label: "Sleep",
            value: totals.sleepSeconds > 0 ? formatDuration(totals.sleepSeconds) : "—",
            testId: "today-sleep",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-stone-400">{s.label}</dt>
            <dd className="mt-0.5 text-lg tabular-nums text-stone-800" data-testid={s.testId}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

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
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="text-2xl">
                    {card.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-stone-800">{card.label}</span>
                    <span
                      className="block truncate text-[11px] text-stone-500"
                      data-testid={`baby-detail-${card.type}`}
                    >
                      {detailLine(last, running, nowMs)}
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
