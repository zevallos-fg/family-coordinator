"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  TILES,
  TILE_MODE,
  openEventFor,
  type BabyEvent,
  type BabyEventType,
} from "@/lib/baby/events";
import { formatAgo, formatClock, secondsBetween } from "@/lib/baby/format";

interface Props {
  events: BabyEvent[];
  kidId: string | null;
  /** Set when there is no baby row yet: tiles render, explain, and refuse to write. */
  blockedReason: ReactNode | null;
  pendingType: BabyEventType | null;
  onTap: (type: BabyEventType) => void;
}

/**
 * One tap logs. No form, no modal, no confirm.
 *
 * A timer tile starts on the first tap and stops on the second; a point tile is
 * finished the moment you lift your finger. Either way the tap itself asks no
 * questions — details are added afterwards from the list below, or never.
 */
export function BabyTiles({ events, kidId, blockedReason, pendingType, onTap }: Props) {
  const running = new Map(
    TILES.map((t) => [t.type, openEventFor(events, t.type, kidId)] as const)
  );
  const anyRunning = [...running.values()].some(Boolean);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const forKid = events.filter((e) => kidId === null || e.kid_id === kidId);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Log
      </h3>

      {blockedReason && (
        <p
          data-testid="baby-tiles-blocked"
          className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {blockedReason}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {TILES.map((tile) => {
          const open = running.get(tile.type) ?? null;
          const mine = forKid.filter((e) => e.event_type === tile.type);
          const lastAt = mine[0]?.started_at ?? null;
          const isPending = pendingType === tile.type;

          return (
            <button
              key={tile.type}
              type="button"
              data-testid={`baby-tile-${tile.type}`}
              onClick={() => onTap(tile.type)}
              disabled={!!blockedReason || isPending}
              aria-pressed={!!open}
              className={`rounded-2xl px-4 py-4 text-left transition-colors disabled:opacity-40 ${
                open
                  ? "bg-emerald-600 text-white active:bg-emerald-700"
                  : "bg-stone-100 text-stone-800 active:bg-stone-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden>{tile.emoji}</span>
                <span className="text-sm font-medium">{tile.label}</span>
              </div>

              {open ? (
                <>
                  <div className="mt-1 font-mono text-2xl tabular-nums">
                    {formatClock(secondsBetween(open.started_at, nowMs) ?? 0)}
                  </div>
                  <div className="text-[11px] opacity-80">Tap to stop</div>
                </>
              ) : (
                <>
                  <div className="mt-1 text-2xl tabular-nums text-stone-800">
                    {mine.length}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    {mine.length === 0
                      ? TILE_MODE[tile.type] === "timer"
                        ? "none today · tap to start"
                        : "none today"
                      : `today · last ${formatAgo(lastAt, nowMs)}`}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
