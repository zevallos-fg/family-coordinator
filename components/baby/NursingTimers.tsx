"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { BabyEvent } from "@/lib/baby/events";
import {
  type FeedPayload,
  type NursingSide,
  SIDE_LABEL,
  displaySeconds,
  formatDuration,
  lastSideOf,
  segmentsOf,
  sessionSeconds,
  startSide,
  stopRunning,
  suggestedSide,
} from "@/lib/baby/nursing";

interface Props {
  events: BabyEvent[];
  kidId: string | null;
  familyId: string;
  /** Set when there is no baby row yet: the screen renders, explains, and refuses. */
  blockedReason: ReactNode | null;
  onChanged: () => void;
}

const SIDES: NursingSide[] = ["L", "R"];

function payloadOf(event: BabyEvent | undefined): FeedPayload {
  if (!event || typeof event.payload !== "object" || event.payload === null) return {};
  return event.payload as FeedPayload;
}

/**
 * Two timers, one session.
 *
 * Each side starts and stops on its own and both feed the same row, because that
 * is what a nursing session is: an ordered list of spells with a total. Filled in
 * 87.8% of 2,526 feeds in three years of this family's data — the most-used field
 * they have, which is why this is the one screen worth matching closely.
 *
 * Nothing about the session lives in React state. The open row and its payload
 * are the whole truth: close the app mid-feed, reopen it, and the clock is still
 * going because `running.since` is a timestamp in the database, not a setInterval
 * that died with the tab.
 */
export function NursingTimers({ events, kidId, familyId, blockedReason, onChanged }: Props) {
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const open = events.find(
    (e) => e.event_type === "feed" && e.ended_at === null && (kidId === null || e.kid_id === kidId)
  );
  const payload = payloadOf(open);
  const running = payload.running ?? null;

  // The side to suggest: the opposite of wherever the last finished feed ended.
  const previous = events.find(
    (e) => e.event_type === "feed" && e.ended_at !== null && (kidId === null || e.kid_id === kidId)
  );
  const suggested = suggestedSide(lastSideOf(payloadOf(previous)));

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function write(next: FeedPayload, opts?: { end?: boolean }) {
    if (blockedReason || !kidId) return;
    setPending(true);
    const supabase = createClient();

    if (!open) {
      const { error } = await supabase.rpc("fn_baby_log", {
        p_family_id: familyId,
        p_event_type: "feed",
        p_kid_id: kidId,
        p_payload: next as never,
        p_at: new Date().toISOString(),
      });
      setPending(false);
      if (error) {
        toast.error("Couldn't start that timer.");
        return;
      }
    } else {
      const { error } = await supabase
        .from("baby_events")
        .update({
          payload: next as never,
          ...(opts?.end ? { ended_at: new Date().toISOString() } : {}),
        })
        .eq("id", open.id);
      setPending(false);
      if (error) {
        // Saying nothing here would leave a timer that looks like it is running
        // and a database that never heard about it.
        toast.error("Couldn't save that — the timer may not be recorded.");
        return;
      }
    }
    onChanged();
  }

  function tapSide(side: NursingSide) {
    const nowIso = new Date().toISOString();
    if (running?.side === side) {
      void write(stopRunning(payload, Date.parse(nowIso)));
    } else {
      void write(startSide(payload, side, nowIso));
    }
  }

  function finish() {
    const nowIso = new Date().toISOString();
    const ended = running ? stopRunning(payload, Date.parse(nowIso)) : payload;
    void write({ ...ended, running: null }, { end: true });
  }

  const total = sessionSeconds(payload, nowMs);
  const segments = segmentsOf(payload);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-stone-700">Nursing</h3>
        {open && (
          <span className="text-sm tabular-nums text-stone-500" data-testid="nursing-total">
            {formatDuration(total)} total
          </span>
        )}
      </div>

      {blockedReason}

      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => {
          const live = running?.side === side;
          const seconds = displaySeconds(payload, side, nowMs);
          const isSuggested = !open && side === suggested;
          return (
            <button
              key={side}
              type="button"
              onClick={() => tapSide(side)}
              disabled={pending || !!blockedReason || !kidId}
              data-testid={`nursing-${side}`}
              data-running={live ? "true" : "false"}
              aria-pressed={live}
              className={`relative rounded-2xl border p-5 text-left transition-colors disabled:opacity-50 ${
                live
                  ? "border-rose-300 bg-rose-50"
                  : "border-stone-200 bg-white hover:bg-stone-50"
              }`}
            >
              {isSuggested && (
                // Which side to start on is the one thing a person cannot
                // reconstruct at 3am, so the answer is on the button.
                <span
                  className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                  data-testid={`nursing-suggested-${side}`}
                >
                  start here
                </span>
              )}
              <div className="text-base font-semibold text-stone-800">{SIDE_LABEL[side]}</div>
              <div className="mt-1 text-2xl tabular-nums text-stone-900">
                {formatDuration(seconds)}
              </div>
              <div className="mt-1 text-xs text-stone-500">
                {live ? "tap to pause" : seconds > 0 ? "tap to resume" : "tap to start"}
              </div>
            </button>
          );
        })}
      </div>

      {segments.length > 0 && (
        <p className="text-xs text-stone-500" data-testid="nursing-segments">
          {segments.map((s) => `${SIDE_LABEL[s.side]} ${formatDuration(s.seconds)}`).join(" → ")}
        </p>
      )}

      {open && (
        <button
          type="button"
          onClick={finish}
          disabled={pending}
          data-testid="nursing-done"
          className="w-full rounded-xl bg-stone-800 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Done
        </button>
      )}
    </section>
  );
}
