"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Baby, Droplet, Milk, Moon, Pill } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { lastEventOf, useBabyLane } from "@/components/baby/useBabyLane";
import { WakeCountdown } from "@/components/baby/WakeCountdown";
import { formatElapsed, secondsBetween } from "@/lib/baby/format";
import { ageInDays, awakeState, guidesFor } from "@/lib/baby/glance";
import { isBottle, bottleAmountLabel } from "@/lib/baby/bottle";
import { SIDE_LABEL, lastSideOf, suggestedSide, type FeedPayload } from "@/lib/baby/nursing";

/** "1h 12m", "47m" — elapsed time without seconds, for a glance. */
function hm(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Each kid's next well visit, from the family brief. */
function useNextVisits(familyId: string): Map<string, { label: string; due_on: string }> {
  const [visits, setVisits] = useState(new Map<string, { label: string; due_on: string }>());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient().rpc("fn_family_brief", { p_family_id: familyId });
      if (cancelled || error || !data) return;
      const next = new Map<string, { label: string; due_on: string }>();
      for (const k of ((data as { kids?: unknown[] }).kids ?? []) as Array<{
        id: string;
        next_checkpoints?: Array<{ label: string; kind: string; due_on: string }>;
      }>) {
        const v = (k.next_checkpoints ?? []).find((c) => c.kind === "well_visit");
        if (v) next.set(k.id, v);
      }
      setVisits(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);
  return visits;
}

function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const QUICK = [
  { href: "/baby/feed", label: "Feed", Icon: Milk },
  { href: "/baby/diaper", label: "Diaper", Icon: Droplet },
  { href: "/baby/sleep", label: "Sleep", Icon: Moon },
  { href: "/baby/medicine", label: "Meds", Icon: Pill },
];

/**
 * Home's Kids card: the youngest child live (awake clock with the wake-window
 * countdown, time since the last feed and which side to start), one-tap logging,
 * and a line for each older child.
 */
export function KidsCard({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const visits = useNextVisits(familyId);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const kid = lane.kids.find((k) => k.id === lane.kidId) ?? null;
  const others = lane.kids.filter((k) => k.id !== kid?.id);
  const days = ageInDays(kid?.birth_date, new Date(nowMs));
  const wake = guidesFor(kid?.birth_date, new Date(nowMs)).wake;
  const awake = awakeState(lane.events, lane.kidId, nowMs);
  const feed = lastEventOf(lane.events, "feed", lane.kidId);
  const feedRunning = !!feed && feed.ended_at === null;
  const feedPayload = (feed?.payload ?? null) as FeedPayload | null;

  let feedSub: string | null = null;
  if (feed && !feedRunning) {
    feedSub = isBottle(feedPayload)
      ? bottleAmountLabel(feedPayload!) ?? "bottle"
      : lastSideOf(feedPayload)
        ? `start ${SIDE_LABEL[suggestedSide(lastSideOf(feedPayload))]}`
        : null;
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3" data-testid="home-kids">
      <Link href="/baby" className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-sky-600">
          <Baby className="h-4 w-4" aria-hidden /> Kids
        </span>
        {kid && (
          <span className="text-xs text-stone-500">
            {kid.name}
            {days !== null && days < 60 ? ` · day ${days}` : ""}
          </span>
        )}
      </Link>

      {lane.failed && <p className="mb-2 text-xs text-rose-700">Couldn&apos;t load the baby log.</p>}

      <div className="grid grid-cols-2 gap-2">
        <Link href="/baby" className="rounded-xl bg-stone-100 px-2.5 py-2" data-testid="home-awake">
          <span className="block text-[11px] text-stone-500">
            {awake?.state === "asleep" ? "Asleep for" : "Awake for"}
          </span>
          <span className="block font-mono text-xl tabular-nums text-sky-600">
            {awake ? formatElapsed(secondsBetween(awake.since, nowMs) ?? 0) : "—"}
          </span>
          {awake?.state === "awake" && wake?.windowMinutes && (
            <WakeCountdown awakeSince={awake.since} windowMinutes={wake.windowMinutes} nowMs={nowMs} compact />
          )}
        </Link>
        <Link href="/baby/feed" className="rounded-xl bg-stone-100 px-2.5 py-2" data-testid="home-feed">
          <span className="block text-[11px] text-stone-500">{feedRunning ? "Feeding" : "Last feed"}</span>
          <span className="block text-xl tabular-nums text-stone-800">
            {!feed
              ? "—"
              : feedRunning
                ? formatElapsed(secondsBetween(feed.started_at, nowMs) ?? 0)
                : hm(secondsBetween(feed.started_at, nowMs) ?? 0)}
          </span>
          {feedSub && <span className="block text-[11px] text-amber-600">{feedSub}</span>}
        </Link>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {QUICK.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 rounded-xl bg-stone-100 py-2 text-xs text-stone-700 active:bg-stone-200"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        ))}
      </div>

      {others.map((k) => {
        const v = visits.get(k.id);
        if (!v) return null;
        return (
          <p key={k.id} className="mt-2 text-xs text-stone-500">
            {k.name}
            {` · ${v.label} ${shortDate(v.due_on)}`}
          </p>
        );
      })}
    </section>
  );
}
