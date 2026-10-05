"use client";

import { formatDuration, formatTimeOfDay } from "@/lib/baby/format";
import { wakeWindow } from "@/lib/baby/glance";

function clockOf(ms: number): string {
  return formatTimeOfDay(new Date(ms).toISOString());
}

/**
 * The wake-window countdown: "Nap window in 12m 30s", then "Nap window open ·
 * 41m 20s left", then "Past the typical window". Counted from when the last sleep
 * ended, against the typical range for her age — a rule of thumb, so the words
 * stay plain and the colour never changes.
 */
export function WakeCountdown({
  awakeSince,
  windowMinutes,
  nowMs,
  compact = false,
}: {
  awakeSince: string;
  windowMinutes: [number, number];
  nowMs: number;
  compact?: boolean;
}) {
  const w = wakeWindow(awakeSince, windowMinutes, nowMs);
  if (!w) return null;
  const span = `${clockOf(w.opensAt)}–${clockOf(w.closesAt)}`;

  const headline =
    w.phase === "before" ? (
      <>
        Nap window in <span className="font-mono tabular-nums">{formatDuration(w.secondsLeft)}</span>
      </>
    ) : w.phase === "open" ? (
      <>
        Nap window open · <span className="font-mono tabular-nums">{formatDuration(w.secondsLeft)}</span> left
      </>
    ) : (
      <>Past the typical window</>
    );

  return (
    <span className="block" data-testid="wake-countdown" data-phase={w.phase}>
      <span className={`block ${compact ? "text-[11px]" : "text-base"} text-sky-700`}>{headline}</span>
      {!compact && <span className="block text-[11px] text-sky-700/80">Typical window {span} · rule of thumb</span>}
    </span>
  );
}
