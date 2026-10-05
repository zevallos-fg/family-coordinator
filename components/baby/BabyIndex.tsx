"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { BabyToday } from "./BabyToday";
import { ShareLinks } from "./ShareLinks";
import { EvidenceCards } from "./EvidenceCards";
import { HeadsUp } from "./HeadsUp";
import { GuideSheet } from "./GuideSheet";
import { WakeCountdown } from "./WakeCountdown";
import { lastEventOf, useBabyLane } from "./useBabyLane";
import { createClient } from "@/lib/supabase/client";
import { formatAgo, formatDuration, formatElapsed, secondsBetween, formatTimeOfDay } from "@/lib/baby/format";
import { eventDuration, eventSummary } from "@/lib/baby/summary";
import { ageInDays, ageInMonths, awakeState, guidesFor, rolling24h, type Guide } from "@/lib/baby/glance";
import type { ShareLink } from "@/lib/baby/events";

type CardType = "feed" | "diaper" | "sleep" | "reports" | "pump" | "growth" | "medicine";

const CARDS: Array<{ type: CardType; label: string; emoji: string; href: string; babyOnly: boolean }> = [
  { type: "feed", label: "Feed", emoji: "🍼", href: "/baby/feed", babyOnly: true },
  { type: "diaper", label: "Diaper", emoji: "🧷", href: "/baby/diaper", babyOnly: true },
  { type: "sleep", label: "Sleep", emoji: "😴", href: "/baby/sleep", babyOnly: true },
  { type: "reports", label: "Reports", emoji: "📊", href: "/baby/reports", babyOnly: true },
  { type: "pump", label: "Pump", emoji: "🫙", href: "/baby/pump", babyOnly: true },
  { type: "growth", label: "Growth", emoji: "📏", href: "/baby/growth", babyOnly: false },
  { type: "medicine", label: "Medicine", emoji: "💊", href: "/baby/medicine", babyOnly: false },
];

/** Point events never end, so "running" is only ever true for a timer type. */
const TIMER_TYPES = new Set(["feed", "sleep", "pump"]);

// Contractions are retired from the page; share links of that scope are no
// longer offered or listed.
const BABY_SCOPES = ["baby_today"];

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
  const duration = eventDuration(last);
  return [ago, duration, summary].filter(Boolean).join(" · ");
}

type Sheet = { title: string; guides: Guide[]; safeSleep?: boolean } | null;

/** "12 in 24h · typ. 8–12  ⓘ" — a count beside its published range, never judged against it. */
function Metric({
  text,
  range,
  onInfo,
  testId,
}: {
  text: string;
  range: string | null;
  onInfo: (() => void) | null;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-4 py-2 text-xs">
      <span className="text-stone-600" data-testid={testId}>
        {text}
        {range && <span className="text-stone-500"> · typ. {range}</span>}
      </span>
      {onInfo && (
        <button type="button" onClick={onInfo} aria-label="What's typical" className="-m-1 p-1 text-stone-400">
          <Info className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * /baby — the Kids page.
 *
 * Top: a heads-up — what needs raising (a timer left open, medicine due, a
 * checkup to book), what's booked, and what's worth knowing at this age.
 *
 * Then one card per kind of entry, each carrying its own numbers: the feed card
 * says how many feeds in 24 hours, the diaper card wet and dirty, the sleep card
 * the awake clock with the nap-window countdown and the day's total. A number
 * sits with the thing it counts, beside the published range for this age, and
 * the ⓘ explains the range and links its source.
 *
 * The live clocks come from database timestamps (`ended_at IS NULL`), so a timer
 * started elsewhere is still visibly running here after the app was closed.
 */
export function BabyIndex({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [linksVersion, setLinksVersion] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
  }, [familyId, linksVersion]);

  const kid = lane.kids.find((k) => k.id === lane.kidId) ?? null;
  const name = kid?.name ?? "your child";
  const visibleForKid = lane.events.filter((e) => e.event_type !== "contraction" && (lane.kidId === null || e.kid_id === lane.kidId));
  const at = new Date(nowMs);
  const guides = guidesFor(kid?.birth_date, at);
  const days = ageInDays(kid?.birth_date, at);
  const isBaby = days === null || days < 730;
  const infant = (ageInMonths(kid?.birth_date, at) ?? 0) < 12;
  const counts = rolling24h(visibleForKid, lane.kidId, nowMs);
  const awake = awakeState(visibleForKid, lane.kidId, nowMs);

  const cards = CARDS.filter((c) => isBaby || !c.babyOnly || visibleForKid.some((e) => e.event_type === c.type));

  function extra(type: CardType) {
    if (type === "feed") {
      return (
        <Metric
          text={`${counts.feeds} in 24h`}
          range={guides.feeds?.range ?? null}
          onInfo={guides.feeds ? () => setSheet({ title: "Feeds", guides: [guides.feeds!] }) : null}
          testId="metric-feeds"
        />
      );
    }
    if (type === "diaper") {
      const g = [guides.wet, guides.stools].filter(Boolean) as Guide[];
      const range = guides.wet || guides.stools ? `${guides.wet?.range ?? "—"} wet / ${guides.stools?.range ?? "—"} dirty` : null;
      return (
        <Metric
          text={`${counts.wet} wet · ${counts.stools} dirty in 24h`}
          range={range}
          onInfo={g.length ? () => setSheet({ title: "Diapers", guides: g }) : null}
          testId="metric-diapers"
        />
      );
    }
    if (type === "sleep") {
      const g = [guides.wake, guides.sleep].filter(Boolean) as Guide[];
      return (
        <>
          {awake && (
            <div className="border-t border-stone-100 px-4 py-2.5" data-testid="awake-timer" data-state={awake.state}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-sky-700">{awake.state === "awake" ? "Awake" : "Asleep"}</span>
                <span className="font-mono text-2xl tabular-nums text-sky-700" data-testid="awake-elapsed">
                  {formatElapsed(secondsBetween(awake.since, nowMs) ?? 0)}
                </span>
              </div>
              {awake.state === "awake" && guides.wake?.windowMinutes && (
                <WakeCountdown awakeSince={awake.since} windowMinutes={guides.wake.windowMinutes} nowMs={nowMs} />
              )}
              <p className="mt-0.5 text-[11px] text-sky-700/80">
                {awake.state === "awake" ? "Woke" : "Fell asleep"} at {formatTimeOfDay(awake.since)}
              </p>
            </div>
          )}
          <Metric
            text={`${counts.sleepSeconds > 0 ? formatDuration(counts.sleepSeconds) : "0"} asleep in 24h`}
            range={guides.sleep?.range ?? null}
            onInfo={g.length || infant ? () => setSheet({ title: "Sleep", guides: g, safeSleep: infant }) : null}
            testId="metric-sleep"
          />
        </>
      );
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-stone-800">Kids</h1>
        {lane.kids.length > 1 && (
          <div className="flex gap-1.5">
            {lane.kids.map((k) => (
              <button
                key={k.id}
                type="button"
                data-testid={`baby-kid-${k.id}`}
                onClick={() => lane.chooseKid(k.id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  lane.kidId === k.id ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
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

      <HeadsUp familyId={familyId} kid={kid} events={visibleForKid} nowMs={nowMs} />

      <ul className="space-y-2.5">
        {cards.map((card) => {
          const last = lastEventOf(visibleForKid, card.type, lane.kidId);
          const running = !!last && last.ended_at === null && TIMER_TYPES.has(card.type);
          return (
            <li
              key={card.type}
              className={`overflow-hidden rounded-2xl ring-1 ${running ? "bg-rose-50 ring-rose-200" : "bg-white ring-stone-200"}`}
            >
              <Link
                href={card.href}
                data-testid={`baby-card-${card.type}`}
                data-running={running ? "true" : "false"}
                className="flex items-center justify-between gap-3 px-4 py-3.5 active:bg-stone-100"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="text-2xl">
                    {card.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-stone-800">{card.label}</span>
                    <span className="block truncate text-[11px] text-stone-500" data-testid={`baby-detail-${card.type}`}>
                      {card.type === "reports" ? "Day and week timelines · trends over weeks and months" : detailLine(last, running, nowMs)}
                    </span>
                  </span>
                </span>
                {running ? (
                  <span data-testid={`baby-elapsed-${card.type}`} className="font-mono text-lg tabular-nums text-rose-700">
                    {formatElapsed(secondsBetween(last.started_at, nowMs) ?? 0)}
                  </span>
                ) : (
                  <span aria-hidden className="text-stone-300">
                    ›
                  </span>
                )}
              </Link>
              {isBaby && extra(card.type)}
            </li>
          );
        })}
      </ul>

      <EvidenceCards familyId={familyId} kidId={lane.kidId} kidName={kid?.name} />

      <BabyToday events={visibleForKid} onChanged={lane.refresh} />

      <ShareLinks
        familyId={familyId}
        links={links}
        onChanged={() => {
          void lane.refresh();
          setLinksVersion((v) => v + 1);
        }}
      />

      <GuideSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.title ?? ""}
        guides={sheet?.guides ?? []}
        kidName={name}
        safeSleep={sheet?.safeSleep}
      />
    </div>
  );
}
