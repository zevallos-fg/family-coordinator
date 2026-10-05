"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@/lib/baby/format";
import { rolling24h } from "@/lib/baby/glance";
import { growthSummary } from "@/lib/baby/growth";
import type { BabyEvent } from "@/lib/baby/events";

type Med = { name: string; dose: string | null; interval_hours: number | null };

/**
 * "Her numbers" for a doctor's visit: what the pediatrician will ask for, read
 * straight from the log. Counts and averages only — what they mean is the
 * doctor's call, which is the point of bringing them.
 */
export function VisitNumbers({ kidId, kidName }: { kidId: string; kidName: string }) {
  const [events, setEvents] = useState<BabyEvent[] | null>(null);
  const [meds, setMeds] = useState<Med[]>([]);
  const [failed, setFailed] = useState(false);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const since = new Date(nowMs - 7 * 86_400_000).toISOString();
      const [ev, growth, md] = await Promise.all([
        supabase.from("baby_events").select("*").eq("kid_id", kidId).gte("started_at", since).order("started_at", { ascending: false }),
        supabase
          .from("baby_events")
          .select("*")
          .eq("kid_id", kidId)
          .eq("event_type", "growth")
          .order("started_at", { ascending: false })
          .limit(1),
        supabase.from("medications").select("name, dose, interval_hours").eq("kid_id", kidId).eq("active", true),
      ]);
      if (cancelled) return;
      setFailed(!!(ev.error || growth.error || md.error));
      const merged = new Map<string, BabyEvent>();
      for (const e of [...(ev.data ?? []), ...(growth.data ?? [])]) merged.set(e.id, e as BabyEvent);
      setEvents([...merged.values()]);
      setMeds((md.data ?? []) as Med[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [kidId, nowMs]);

  if (failed) return <p className="text-xs text-rose-700">Couldn&apos;t load {kidName}&apos;s numbers.</p>;
  if (!events) return null;

  const day = rolling24h(events, kidId, nowMs);
  // Average over the days the log actually covers, up to 7, so a 5-day-old's
  // "per day" isn't divided by a week she hasn't lived.
  const first = events.reduce((m, e) => Math.min(m, Date.parse(e.started_at)), nowMs);
  const span = Math.max(1, Math.min(7, Math.ceil((nowMs - first) / 86_400_000)));
  let feeds = 0;
  let wet = 0;
  let dirty = 0;
  for (const e of events) {
    if (Date.parse(e.started_at) < nowMs - span * 86_400_000) continue;
    if (e.event_type === "feed") feeds++;
    if (e.event_type === "diaper") {
      const c = (e.payload as { contents?: string } | null)?.contents;
      if (c === "pee" || c === "both") wet++;
      if (c === "poo" || c === "both") dirty++;
    }
  }
  const avg = (n: number) => (n / span).toFixed(1).replace(/\.0$/, "");
  const growth = events.find((e) => e.event_type === "growth");

  const rows: Array<[string, string, string]> = [
    ["Feeds", String(day.feeds), avg(feeds)],
    ["Wet diapers", String(day.wet), avg(wet)],
    ["Dirty diapers", String(day.stools), avg(dirty)],
    ["Sleep", day.sleepSeconds ? formatDuration(day.sleepSeconds) : "—", "—"],
  ];

  return (
    <section className="space-y-1.5" data-testid="visit-numbers">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">{kidName}&apos;s numbers to show</h2>
      <div className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] text-stone-500">
              <th className="font-normal" />
              <th className="font-normal">Last 24h</th>
              <th className="font-normal">Avg/day ({span}d)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label} className="text-stone-800">
                <td className="py-0.5 text-stone-600">{label}</td>
                <td className="tabular-nums">{a}</td>
                <td className="tabular-nums">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-600">
          Last weight: {growth ? `${growthSummary(growth.payload as Record<string, unknown>) ?? "logged"} (${new Date(growth.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : "none logged"}
        </p>
        {meds.length > 0 && (
          <p className="mt-1 text-xs text-stone-600">
            Medicines: {meds.map((m) => [m.name, m.dose].filter(Boolean).join(" ")).join("; ")}
          </p>
        )}
        <p className="mt-2 text-[11px] text-stone-400">From your log. Numbers only — ask the doctor what they mean.</p>
      </div>
    </section>
  );
}
