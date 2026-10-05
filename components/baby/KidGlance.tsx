"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { createClient } from "@/lib/supabase/client";
import { formatClock, formatDuration, formatTimeOfDay, secondsBetween } from "@/lib/baby/format";
import {
  AAP_SAFE_SLEEP,
  SAFE_SLEEP_POINTS,
  ageInMonths,
  awakeState,
  guidesFor,
  rolling24h,
  type Guide,
} from "@/lib/baby/glance";
import type { BabyEvent } from "@/lib/baby/events";

type Kid = { id: string; name: string; birth_date: string | null };

type Upcoming = { label: string; detail: string };

/** Next medicine dose and next checkup, from the family brief. */
function useUpcoming(familyId: string, kidId: string | null, refreshKey: string): Upcoming[] {
  const [items, setItems] = useState<Upcoming[]>([]);
  useEffect(() => {
    if (!kidId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient().rpc("fn_family_brief", { p_family_id: familyId });
      if (cancelled || error || !data) return;
      const kid = ((data as { kids?: unknown[] }).kids ?? []).find(
        (k) => (k as { id?: string }).id === kidId
      ) as
        | {
            medicines?: Array<{ name: string; next_due_at: string | null }>;
            next_checkpoints?: Array<{ label: string; kind: string; due_on: string }>;
          }
        | undefined;
      const next: Upcoming[] = [];
      const meds = (kid?.medicines ?? [])
        .filter((m) => m.next_due_at)
        .sort((a, b) => Date.parse(a.next_due_at!) - Date.parse(b.next_due_at!));
      if (meds[0]) {
        const due = Date.parse(meds[0].next_due_at!);
        next.push({
          label: meds[0].name,
          detail: due <= Date.now() ? "due now" : `due ${formatTimeOfDay(meds[0].next_due_at!)}`,
        });
      }
      const visit = (kid?.next_checkpoints ?? []).find((c) => c.kind === "well_visit");
      if (visit) {
        const [y, m, d] = visit.due_on.split("-").map(Number);
        next.push({
          label: visit.label,
          detail: `around ${new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        });
      }
      setItems(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, kidId, refreshKey]);
  return kidId ? items : [];
}

function GuideBody({ guide, kidName }: { guide: Guide; kidName: string }) {
  return (
    <div className="space-y-3">
      <p className="text-3xl font-light tabular-nums text-sky-600">{guide.range}</p>
      <p className="text-sm leading-relaxed text-stone-700">{guide.body}</p>
      {guide.ruleOfThumb && (
        <p className="text-xs text-stone-500">A rule of thumb, not research — use it as a nudge, not a target.</p>
      )}
      <a
        href={guide.source.url}
        target="_blank"
        rel="noreferrer"
        className="block text-xs text-amber-700 underline underline-offset-2"
      >
        {guide.source.title}
      </a>
      <p className="text-[11px] text-stone-400">
        General information, not medical advice. Questions about {kidName} go to your pediatrician.
      </p>
    </div>
  );
}

/**
 * The top of /baby: how long she has been awake, the last 24 hours against the
 * published ranges, and what is coming up.
 *
 * Nothing here judges a number. A count sits beside its range in the same
 * colour, whichever side of it the count falls on; tapping explains the range
 * and links its source. See lib/baby/glance.ts.
 */
export function KidGlance({
  familyId,
  kid,
  events,
  nowMs,
}: {
  familyId: string;
  kid: Kid | null;
  events: BabyEvent[];
  nowMs: number;
}) {
  const [open, setOpen] = useState<"wake" | "feeds" | "wet" | "stools" | "sleep" | null>(null);
  const kidId = kid?.id ?? null;
  const name = kid?.name ?? "your child";
  const guides = guidesFor(kid?.birth_date, new Date(nowMs));
  const infant = (ageInMonths(kid?.birth_date, new Date(nowMs)) ?? 99) < 12;
  const counts = rolling24h(events, kidId, nowMs);
  const awake = awakeState(events, kidId, nowMs);
  // A dose given moves "next due", so the latest dose is the refresh key.
  const lastDoseKey = events.find((e) => e.event_type === "medicine")?.started_at ?? "";
  const upcoming = useUpcoming(familyId, kidId, lastDoseKey);

  const tiles = [
    { key: "feeds" as const, label: "Feeds", value: String(counts.feeds), n: counts.feeds },
    { key: "wet" as const, label: "Wet", value: String(counts.wet), n: counts.wet },
    { key: "stools" as const, label: "Dirty", value: String(counts.stools), n: counts.stools },
    {
      key: "sleep" as const,
      label: "Sleep",
      value: counts.sleepSeconds > 0 ? formatDuration(counts.sleepSeconds) : "0",
      n: counts.sleepSeconds,
    },
  ].filter((t) => guides[t.key] || t.n > 0);

  const elapsed = awake ? (secondsBetween(awake.since, nowMs) ?? 0) : 0;
  const openGuide = open && open !== "wake" ? guides[open] : null;

  return (
    <section className="space-y-2.5" data-testid="kid-glance">
      <button
        type="button"
        onClick={() => setOpen("wake")}
        data-testid="awake-timer"
        data-state={awake?.state ?? "none"}
        className="w-full rounded-2xl bg-sky-50 px-4 py-4 text-left ring-1 ring-sky-200 active:bg-sky-100"
      >
        {awake ? (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-sky-700">{awake.state === "awake" ? "Awake" : "Asleep"}</span>
              <span className="font-mono text-3xl tabular-nums text-sky-800" data-testid="awake-elapsed">
                {formatClock(elapsed)}
              </span>
            </span>
            <span className="mt-1 flex items-center justify-between gap-3 text-[11px] text-sky-700/80">
              <span>
                since {formatTimeOfDay(awake.since)}
                {awake.state === "awake" && guides.wake ? ` · typical window ${guides.wake.range}` : ""}
              </span>
              <span aria-hidden>ⓘ</span>
            </span>
          </>
        ) : (
          <span className="flex items-center justify-between text-sm text-sky-700">
            <span>No sleep logged in the last 24 hours</span>
            <span aria-hidden>ⓘ</span>
          </span>
        )}
      </button>

      {tiles.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-stone-400">Last 24 hours</p>
          <dl className={`grid gap-2 ${tiles.length >= 4 ? "grid-cols-4" : tiles.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {tiles.map((t) => {
              const g = guides[t.key];
              const inner = (
                <>
                  <dt className="text-[11px] uppercase tracking-wide text-stone-400">{t.label}</dt>
                  <dd className="mt-0.5 whitespace-nowrap text-base tabular-nums text-stone-800" data-testid={`glance-${t.key}`}>
                    {t.value}
                  </dd>
                  {g && (
                    <dd className="whitespace-nowrap text-[10px] text-stone-500" data-testid={`glance-range-${t.key}`}>
                      typ. {g.range}
                    </dd>
                  )}
                </>
              );
              return g ? (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setOpen(t.key)}
                  className="rounded-xl border border-stone-200 bg-white min-w-0 px-2 py-2 text-left active:bg-stone-100"
                >
                  {inner}
                </button>
              ) : (
                <div key={t.key} className="min-w-0 rounded-xl border border-stone-200 bg-white px-2 py-2">
                  {inner}
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {upcoming.length > 0 && (
        <ul className="space-y-1" data-testid="glance-upcoming">
          {upcoming.map((u) => (
            <li key={u.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-stone-600">{u.label}</span>
              <span className="shrink-0 text-violet-600">{u.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open === "wake"} onClose={() => setOpen(null)} title={infant ? "Wake window & safe sleep" : "Sleep"}>
        <div className="space-y-5">
          {guides.wake && <GuideBody guide={guides.wake} kidName={name} />}
          {guides.sleep && !guides.wake && <GuideBody guide={guides.sleep} kidName={name} />}
          {infant && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-stone-800">Safe sleep</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
                {SAFE_SLEEP_POINTS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <a
                href={AAP_SAFE_SLEEP.url}
                target="_blank"
                rel="noreferrer"
                className="block text-xs text-amber-700 underline underline-offset-2"
              >
                {AAP_SAFE_SLEEP.title}
              </a>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={!!openGuide} onClose={() => setOpen(null)} title={openGuide?.title ?? ""}>
        {openGuide && <GuideBody guide={openGuide} kidName={name} />}
      </Sheet>
    </section>
  );
}
