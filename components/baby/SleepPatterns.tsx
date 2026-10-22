"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBabyLane } from "./useBabyLane";
import { useKidEvents } from "./reports/useKidEvents";
import { REPORT_COLORS } from "@/lib/baby/reports";
import { byMethod, byNap, fmtMin, methodLabel, moodLabel, sleepRows, type SleepRow } from "@/lib/baby/settle";

const RANGES = [7, 14, 30] as const;
const TYPES = ["sleep", "settle"];
// Validated pair on the dark card (#1C2540): dataviz validate_palette, all checks pass.
const NAP1 = REPORT_COLORS.feed;
const OTHER = REPORT_COLORS.sleep;

type RefNote = { id: string; payload: { category?: string; text?: string; detail?: string | null; position?: number; source?: string } };

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

function useReferenceNotes(familyId: string) {
  const [notes, setNotes] = useState<RefNote[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("baby_events")
        .select("id, payload")
        .eq("family_id", familyId)
        .eq("event_type", "note")
        .eq("payload->>kind", "reference")
        .eq("payload->>topic", "sleep");
      // supabase-error-ignored: reference notes are optional context; the patterns stand without them.
      if (!cancelled) setNotes(((data ?? []) as RefNote[]).sort((a, b) => (a.payload.position ?? 0) - (b.payload.position ?? 0)));
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);
  return notes;
}

/**
 * Awake window (x) against minutes to settle (y), first naps in rose gold.
 * Answers "does a longer or shorter window make the first nap harder?" once
 * there are enough points to see it. Tap a dot to read it.
 */
function Scatter({ rows, onPick, picked }: { rows: SleepRow[]; onPick: (r: SleepRow | null) => void; picked: string | null }) {
  const pts = rows.filter((r) => r.napIndex !== null && r.awakeBeforeMin !== null && r.settleMin !== null);
  if (pts.length < 2) return null;
  const W = 320,
    H = 190,
    L = 34,
    B = 26,
    T = 8,
    R = 10;
  const maxX = Math.max(60, ...pts.map((p) => p.awakeBeforeMin!)) * 1.1;
  const maxY = Math.max(20, ...pts.map((p) => p.settleMin!)) * 1.15;
  const sx = (v: number) => L + (v / maxX) * (W - L - R);
  const sy = (v: number) => H - B - (v / maxY) * (H - B - T);
  const step = (m: number) => (m > 150 ? 60 : m > 60 ? 30 : 15);
  const xt = Array.from({ length: Math.floor(maxX / step(maxX)) + 1 }, (_, i) => i * step(maxX));
  const yt = Array.from({ length: Math.floor(maxY / step(maxY)) + 1 }, (_, i) => i * step(maxY));
  return (
    <figure className="space-y-1.5" data-testid="settle-scatter">
      <figcaption className="text-xs text-stone-600">Awake window before vs. minutes to settle</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scatter of awake window against minutes to settle; the table below has the same numbers">
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="currentColor" className="text-stone-200" strokeWidth={1} />
            <text x={L - 4} y={sy(v) + 3} textAnchor="end" className="fill-stone-500 text-[9px]">
              {v}m
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={H - B + 12} textAnchor="middle" className="fill-stone-500 text-[9px]">
            {fmtMin(v)}
          </text>
        ))}
        <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" className="fill-stone-500 text-[9px]">
          awake before settling
        </text>
        {pts.map((p) => (
          <g key={p.id} onClick={() => onPick(picked === p.id ? null : p)} className="cursor-pointer">
            <circle cx={sx(p.awakeBeforeMin!)} cy={sy(p.settleMin!)} r={12} fill="transparent" />
            <circle
              cx={sx(p.awakeBeforeMin!)}
              cy={sy(p.settleMin!)}
              r={picked === p.id ? 6 : 4.5}
              fill={p.napIndex === 1 ? NAP1 : OTHER}
              stroke="#1c2540"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <div className="flex gap-4 text-[11px] text-stone-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: NAP1 }} aria-hidden /> First nap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: OTHER }} aria-hidden /> Other naps
        </span>
      </div>
    </figure>
  );
}

function rowLine(r: SleepRow, withHead = true) {
  return [
    withHead ? `${r.label} ${time(r.asleepAt)}` : null,
    r.awakeBeforeMin !== null ? `awake ${fmtMin(r.awakeBeforeMin)}` : null,
    r.settleMin !== null ? `settled in ${fmtMin(r.settleMin)}` : null,
    r.durationMin !== null ? `slept ${fmtMin(r.durationMin)}` : "still asleep",
    r.tried.length ? `tried ${r.tried.map(methodLabel).join(" → ")}` : null,
    r.worked ? `worked: ${methodLabel(r.worked)}` : null,
    r.mood ? moodLabel(r.mood) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * /baby/sleep/patterns — Yenny's questions, answered from the log: which naps
 * are harder, how long settling takes, what the awake window was before, and
 * what she used and what worked. The same numbers Claude reads.
 */
export function SleepPatterns({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    startTransition(() => setNowMs(Date.now()));
  }, []);
  const since = nowMs === null ? null : (() => {
    const d = new Date(nowMs - days * 86_400_000);
    d.setHours(0, 0, 0, 0);
    // A day earlier, so the first day's awake windows have the sleep before them.
    return d.getTime() - 86_400_000;
  })();
  const { events, failed } = useKidEvents(lane.kidId, since, TYPES);
  const notes = useReferenceNotes(familyId);
  if (nowMs === null || since === null) return <div className="min-h-screen" />;
  return (
    <PatternsView
      kids={lane.kids}
      kidId={lane.kidId}
      onKid={lane.chooseKid}
      days={days}
      onDays={setDays}
      events={events}
      failed={failed}
      notes={notes}
      nowMs={nowMs}
      since={since}
    />
  );
}

export function PatternsView({
  kids,
  kidId,
  onKid,
  days,
  onDays,
  events,
  failed,
  notes,
  nowMs,
  since,
}: {
  kids: Array<{ id: string; name: string }>;
  kidId: string | null;
  onKid: (id: string) => void;
  days: (typeof RANGES)[number];
  onDays: (d: (typeof RANGES)[number]) => void;
  events: Array<{ id: string; event_type: string; started_at: string; ended_at: string | null; payload: unknown }> | null;
  failed: boolean;
  notes: RefNote[];
  nowMs: number;
  since: number;
}) {
  const [picked, setPicked] = useState<SleepRow | null>(null);
  const kid = kids.find((k) => k.id === kidId) ?? null;

  const { rows, failedSettles } = useMemo(() => {
    if (!events) return { rows: [] as SleepRow[], failedSettles: [] };
    const all = sleepRows(events, nowMs);
    const from = since + 86_400_000;
    return { rows: all.rows.filter((r) => r.asleepAt >= from), failedSettles: all.failed.filter((f) => f.at >= from) };
  }, [events, nowMs, since]);
  const naps = byNap(rows);
  const methods = byMethod(rows, failedSettles);
  const withSettle = rows.filter((r) => r.settleMin !== null || r.worked || r.mood).length;

  const byDay = useMemo(() => {
    const m = new Map<number, SleepRow[]>();
    for (const r of rows) m.set(r.day, [...(m.get(r.day) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);

  return (
    <div className="mx-auto max-w-md space-y-5 pb-8" data-testid="sleep-patterns">
      <div className="flex items-center justify-between">
        <Link href="/baby/sleep" className="flex items-center gap-1 text-sm text-stone-600">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Sleep
        </Link>
        {kids.length > 1 && (
          <div className="flex gap-1.5">
            {kids.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => onKid(k.id)}
                className={`rounded-full px-3 py-1 text-xs ${k.id === kidId ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
              >
                {k.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <header className="space-y-1">
        <h1 className="text-lg font-medium text-stone-800">Settling patterns{kid ? ` · ${kid.name}` : ""}</h1>
        <p className="text-xs text-stone-500">
          Which naps are harder, how long settling takes, the awake window before, and what worked. Typical = the middle value
          (median).
        </p>
        <div className="flex gap-1.5 pt-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onDays(r)}
              aria-pressed={days === r}
              className={`rounded-full px-3 py-1 text-xs ${days === r ? "bg-violet-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </header>

      {failed && <p className="text-xs text-rose-700">Some entries didn&apos;t load. Reload to try again.</p>}

      {events && withSettle === 0 && (
        <p className="rounded-xl bg-white px-3 py-3 text-sm text-stone-600 ring-1 ring-stone-200" data-testid="patterns-empty">
          No settling logged in these {days} days yet. On the Sleep page, tap <span className="text-stone-800">Start settling</span> when you
          start putting them down, tap what you try, then <span className="text-stone-800">Asleep</span>. Patterns show up here after a
          few days.
        </p>
      )}

      {naps.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-xs uppercase tracking-wide text-stone-400">By nap</h2>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <table className="w-full whitespace-nowrap text-xs tabular-nums" data-testid="patterns-by-nap">
              <thead>
                <tr className="text-left text-[11px] text-stone-500">
                  <th className="px-3 py-2 font-normal" />
                  <th className="px-1.5 py-2 font-normal">Awake</th>
                  <th className="px-1.5 py-2 font-normal">Settle</th>
                  <th className="px-1.5 py-2 font-normal">Slept</th>
                  <th className="px-1.5 py-2 pr-3 font-normal">Fussy+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {naps.map((n) => {
                  const moodN = Object.values(n.moods).reduce((a, b) => a + b, 0);
                  const hard = (n.moods.fussy ?? 0) + (n.moods.crying ?? 0);
                  return (
                    <tr key={n.label} className="text-stone-800">
                      <td className="px-3 py-2">
                        {n.label}
                        <span className="block text-[10px] text-stone-500">{n.sleeps} logged</span>
                      </td>
                      <td className="px-1.5">{fmtMin(n.awakeMed)}</td>
                      <td className="px-1.5">
                        {fmtMin(n.settleMed)}
                        {n.settled > 0 && n.settled < n.sleeps && <span className="block text-[10px] text-stone-500">of {n.settled}</span>}
                      </td>
                      <td className="px-1.5">{fmtMin(n.durationMed)}</td>
                      <td className="px-1.5 pr-3">{moodN ? `${hard} of ${moodN}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-500">
            Typical values. Awake = from waking to starting to settle. Settle = minutes until asleep. Fussy+ = went down fussy or crying.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
          <Scatter rows={rows} picked={picked?.id ?? null} onPick={setPicked} />
          {rows.some((r) => r.napIndex !== null && r.awakeBeforeMin !== null && r.settleMin !== null) && (
            <p className="min-h-[2rem] rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700">
              {picked ? `${new Date(picked.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${rowLine(picked)}` : "Tap a dot to see that nap."}
            </p>
          )}
        </section>
      )}

      {methods.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-xs uppercase tracking-wide text-stone-400">What worked</h2>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-xs tabular-nums" data-testid="patterns-by-method">
              <thead>
                <tr className="text-left text-[11px] text-stone-500">
                  <th className="px-3 py-2 font-normal" />
                  <th className="px-1.5 py-2 font-normal">Worked</th>
                  <th className="px-1.5 py-2 font-normal">Tried</th>
                  <th className="px-1.5 py-2 pr-3 font-normal">To settle, when it worked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {methods.map((m) => (
                  <tr key={m.method} className="text-stone-800">
                    <td className="px-3 py-2">{methodLabel(m.method)}</td>
                    <td className="px-1.5">{m.worked}</td>
                    <td className="px-1.5">{m.method === "own" ? "—" : m.tried}</td>
                    <td className="px-1.5 pr-3">{fmtMin(m.settleMedWhenWorked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failedSettles.length > 0 && (
            <p className="text-xs text-stone-500">
              {failedSettles.length} settling {failedSettles.length === 1 ? "attempt" : "attempts"} stopped without sleep — counted in “Tried”.
            </p>
          )}
        </section>
      )}

      {byDay.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-xs uppercase tracking-wide text-stone-400">Day by day</h2>
          <ul className="space-y-2">
            {byDay.map(([day, rs]) => (
              <li key={day} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5">
                <p className="text-xs font-medium text-stone-800">
                  {new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </p>
                <ul className="mt-1 space-y-1.5">
                  {rs.map((r) => (
                    <li key={r.id} className="text-[11px] leading-snug text-stone-600">
                      <span className="text-stone-800">
                        {r.label} · {time(r.asleepAt)}
                      </span>{" "}
                      {rowLine(r, false)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <details className="rounded-xl bg-stone-100 px-3 py-2.5 text-xs text-stone-600" data-testid="leo-notes">
          <summary className="cursor-pointer list-none text-stone-700">From Leo&apos;s sleep plan (2023)</summary>
          <p className="mt-2 text-[11px] text-stone-500">
            Notes kept while sleep-training Leo at 7–15 months. Reference only — the ages and times in them were Leo&apos;s.
          </p>
          <ul className="mt-2 space-y-2">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="text-[10px] uppercase tracking-wide text-stone-400">{n.payload.category}</span>
                <p className="text-stone-700">{n.payload.text}</p>
                {n.payload.detail && <p className="whitespace-pre-line text-stone-500">{n.payload.detail}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
