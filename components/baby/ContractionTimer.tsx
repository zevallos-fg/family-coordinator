"use client";

import { useEffect, useState } from "react";
import type { ContractionRow } from "@/lib/baby/events";
import {
  formatClock,
  formatDuration,
  formatTimeOfDay,
  secondsBetween,
} from "@/lib/baby/format";

interface Props {
  /** Newest first, straight from v_contractions_recent (a rolling 12 hours). */
  rows: ContractionRow[];
  pending: boolean;
  onToggle: () => void;
}

/**
 * One large toggle and a column of numbers.
 *
 * DELIBERATELY ABSENT, and it must stay that way: any reading of those numbers.
 * No "time to go in", no 5-1-1 rule, no colour that turns amber or red at a
 * threshold, no count of how many fell inside a window. This screen reports; a
 * clinician interprets, and the share link is how they get the same figures.
 */
export function ContractionTimer({ rows, pending, onToggle }: Props) {
  const running = rows.find((r) => r.in_progress) ?? null;
  const completed = rows.filter((r) => !r.in_progress);
  const last = completed[0] ?? null;

  // One interval for the whole component, and only while something is running.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const liveSeconds = running ? secondsBetween(running.started_at, nowMs) ?? 0 : 0;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Contractions
      </h3>

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        data-testid="contraction-toggle"
        aria-pressed={!!running}
        className={`w-full rounded-2xl px-5 py-7 text-center transition-colors disabled:opacity-70 ${
          running
            ? "bg-rose-600 text-white active:bg-rose-700"
            : "bg-stone-800 text-white active:bg-stone-900"
        }`}
      >
        <div className="text-sm font-medium opacity-80">
          {running ? "Tap to stop" : "Tap to start"}
        </div>
        <div className="mt-1 font-mono text-4xl tabular-nums">
          {running ? formatClock(liveSeconds) : "0:00"}
        </div>
      </button>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat
          label={running ? "This one" : "Last"}
          value={
            running
              ? formatDuration(liveSeconds)
              : formatDuration(last?.duration_s ?? null)
          }
        />
        <Stat
          label="Interval"
          value={formatDuration(
            (running ? running.since_prev_s : last?.since_prev_s) ?? null
          )}
        />
        <Stat label="Last 12h" value={String(rows.length)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-stone-400">
          Nothing recorded in the last 12 hours.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {rows.slice(0, 8).map((r, i) => (
            <li
              key={r.id ?? `${r.started_at}-${i}`}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-stone-500">
                {r.started_at ? formatTimeOfDay(r.started_at) : "—"}
              </span>
              <span className="flex gap-4 font-mono tabular-nums text-stone-700">
                <span className="w-16 text-right">
                  {r.in_progress
                    ? formatDuration(secondsBetween(r.started_at, nowMs))
                    : formatDuration(r.duration_s)}
                </span>
                <span className="w-20 text-right text-stone-400">
                  {formatDuration(r.since_prev_s)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-stone-400">
        Duration and interval, as recorded. Share these with your clinician —
        this app does not interpret them.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-100 px-2 py-2.5">
      <div className="font-mono text-base tabular-nums text-stone-800">{value}</div>
      <div className="text-[11px] text-stone-500">{label}</div>
    </div>
  );
}
