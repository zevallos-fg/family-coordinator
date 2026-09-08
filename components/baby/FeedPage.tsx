"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BabyPageShell } from "./BabyPageShell";
import { RecentList } from "./RecentList";
import { useBabyLane } from "./useBabyLane";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import { logCompleted } from "@/lib/baby/write";
import {
  SIDE_LABEL,
  displaySeconds,
  formatDuration,
  lastSideOf,
  segmentsOf,
  sessionSeconds,
  startSide,
  stopRunning,
  suggestedSide,
  type FeedPayload,
  type NursingSide,
} from "@/lib/baby/nursing";
import type { BabyEvent } from "@/lib/baby/events";

type Mode = "nursing" | "bottle";
const SIDES: NursingSide[] = ["L", "R"];

function payloadOf(event: BabyEvent | undefined | null): FeedPayload {
  if (!event || typeof event.payload !== "object" || event.payload === null) return {};
  return event.payload as FeedPayload;
}

/**
 * /baby/feed — the most-used surface in three years of this family's data.
 *
 * 87.8% of 2,526 feeds carried per-side timings, which is why nursing gets the
 * whole page rather than a strip inside a sheet: two circular timers, each
 * independently start/stop, both feeding one session on one row.
 *
 * Nothing about the session lives in React state. The open row and its payload
 * are the whole truth — close the app mid-feed, reopen it, and the clock is
 * still going because `running.since` is a timestamp in the database, not a
 * setInterval that died with the tab.
 */
export function FeedPage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [mode, setMode] = useState<Mode>("nursing");
  const [startAt, setStartAt] = useState(() => toLocalInputValue());
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const open = lane.events.find(
    (e) => e.event_type === "feed" && e.ended_at === null && (lane.kidId === null || e.kid_id === lane.kidId)
  );
  const payload = payloadOf(open);
  const running = payload.running ?? null;

  const previous = lane.events.find(
    (e) => e.event_type === "feed" && e.ended_at !== null && (lane.kidId === null || e.kid_id === lane.kidId)
  );
  const suggested = suggestedSide(lastSideOf(payloadOf(previous)));

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const blocked =
    !lane.loading && lane.kids.length === 0 ? (
      <>
        No child record yet, so feeds have nowhere to go.{" "}
        <Link href="/caregiver/kids/new" className="underline underline-offset-2">
          Add the baby
        </Link>
        .
      </>
    ) : null;

  /**
   * Write the session. The row is created on the first tap using the START TIME
   * as its `p_at`, so a feed written up twenty minutes later is filed when it
   * happened rather than when it was typed.
   */
  async function write(next: FeedPayload, opts?: { end?: boolean }) {
    if (blocked || !lane.kidId) return;
    setPending(true);
    const supabase = createClient();

    if (!open) {
      const { error } = await supabase.rpc("fn_baby_log", {
        p_family_id: familyId,
        p_event_type: "feed",
        p_kid_id: lane.kidId,
        p_payload: next as never,
        p_at: fromLocalInputValue(startAt) ?? new Date().toISOString(),
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
    await lane.refresh();
    if (opts?.end) setStartAt(toLocalInputValue());
  }

  function tapSide(side: NursingSide) {
    const nowIso = new Date().toISOString();
    if (running?.side === side) void write(stopRunning(payload, Date.parse(nowIso)));
    else void write(startSide(payload, side, nowIso));
  }

  function finish() {
    const nowIso = new Date().toISOString();
    const ended = running ? stopRunning(payload, Date.parse(nowIso)) : payload;
    void write({ ...ended, running: null }, { end: true });
  }

  const total = sessionSeconds(payload, nowMs);
  const segments = segmentsOf(payload);

  return (
    <BabyPageShell
      title="Feed"
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={startAt}
      onStartAt={setStartAt}
      reminderLabel="Feed"
      blockedReason={blocked}
      segmented={
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
          {(["nursing", "bottle"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`feed-mode-${m}`}
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 text-sm capitalize ${
                mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      }
      manualEntry={<ManualFeed familyId={familyId} kidId={lane.kidId} onSaved={lane.refresh} />}
    >
      {mode === "nursing" ? (
        <section className="space-y-4">
          {open && (
            <p className="text-center text-sm tabular-nums text-stone-500" data-testid="nursing-total">
              {formatDuration(total)} total
            </p>
          )}

          {/* Two circles, thumb-reachable, the entire body of the page. */}
          <div className="grid grid-cols-2 gap-4">
            {SIDES.map((side) => {
              const live = running?.side === side;
              const seconds = displaySeconds(payload, side, nowMs);
              const isSuggested = !open && side === suggested;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => tapSide(side)}
                  disabled={pending || !!blocked || !lane.kidId}
                  data-testid={`nursing-${side}`}
                  data-running={live ? "true" : "false"}
                  aria-pressed={live}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-full border-4 transition-colors disabled:opacity-50 ${
                    live
                      ? "border-rose-400 bg-rose-50"
                      : "border-stone-200 bg-white active:bg-stone-50"
                  }`}
                >
                  {isSuggested && (
                    // Which side to start on is the one thing a person cannot
                    // reconstruct at 3am, so the answer is on the button.
                    <span
                      className="absolute top-5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                      data-testid={`nursing-suggested-${side}`}
                    >
                      start here
                    </span>
                  )}
                  <span className="text-base font-semibold text-stone-800">{SIDE_LABEL[side]}</span>
                  <span className="mt-1 text-3xl tabular-nums text-stone-900">
                    {formatDuration(seconds)}
                  </span>
                  <span className="mt-1 text-[11px] text-stone-400">
                    {live ? "tap to pause" : seconds > 0 ? "tap to resume" : "tap to start"}
                  </span>
                </button>
              );
            })}
          </div>

          {segments.length > 0 && (
            <p className="text-center text-xs text-stone-500" data-testid="nursing-segments">
              {segments.map((s) => `${SIDE_LABEL[s.side]} ${formatDuration(s.seconds)}`).join(" → ")}
            </p>
          )}

          {open && (
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              data-testid="nursing-done"
              className="w-full rounded-2xl bg-stone-800 px-4 py-4 text-base font-medium text-white disabled:opacity-50"
            >
              Done
            </button>
          )}
        </section>
      ) : (
        <BottleForm
          familyId={familyId}
          kidId={lane.kidId}
          startAt={startAt}
          disabled={!!blocked || !lane.kidId}
          onSaved={async () => {
            await lane.refresh();
            setStartAt(toLocalInputValue());
          }}
        />
      )}

      <RecentList events={lane.events} type="feed" onChanged={lane.refresh} />
    </BabyPageShell>
  );
}

/**
 * Bottles. Volume and contents, and nothing else.
 *
 * `contents` is free text with a suggestion rather than an enum: the export's
 * most common value is "Breast Milk", which is a bottle of the same thing
 * nursing produces, and a fixed list would have to guess at the rest.
 */
function BottleForm({
  familyId,
  kidId,
  startAt,
  disabled,
  onSaved,
}: {
  familyId: string;
  kidId: string | null;
  startAt: string;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [ml, setMl] = useState("");
  const [contents, setContents] = useState("Breast Milk");
  const [saving, setSaving] = useState(false);

  async function save() {
    const volume = Number(ml);
    if (!Number.isFinite(volume) || volume <= 0) {
      toast.error("How many ml?");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_baby_log", {
      p_family_id: familyId,
      p_event_type: "feed",
      p_kid_id: kidId ?? undefined,
      p_payload: { method: "bottle", volume_ml: volume, contents } as never,
      p_at: fromLocalInputValue(startAt) ?? new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("That didn't save. Tap again?");
      return;
    }
    setMl("");
    await onSaved();
    toast.success("Bottle logged");
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
          Volume
        </label>
        <div className="mt-1 flex items-baseline gap-2">
          <input
            inputMode="numeric"
            value={ml}
            data-testid="bottle-ml"
            onChange={(e) => setMl(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="w-28 bg-transparent text-4xl tabular-nums text-stone-900 placeholder-stone-200 focus:outline-none"
          />
          <span className="text-lg text-stone-400">ml</span>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
          Contents
        </label>
        <input
          value={contents}
          data-testid="bottle-contents"
          onChange={(e) => setContents(e.target.value)}
          className="mt-1 w-full bg-transparent text-base text-stone-800 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || disabled}
        data-testid="bottle-save"
        className="w-full rounded-2xl bg-stone-800 px-4 py-4 text-base font-medium text-white disabled:opacity-50"
      >
        Log bottle
      </button>
    </section>
  );
}

/** A feed that is already over: both ends given, written as one finished row. */
function ManualFeed({
  familyId,
  kidId,
  onSaved,
}: {
  familyId: string;
  kidId: string | null;
  onSaved: () => Promise<void>;
}) {
  const [from, setFrom] = useState(() => toLocalInputValue(new Date(Date.now() - 30 * 60_000)));
  const [to, setTo] = useState(() => toLocalInputValue());
  const [saving, setSaving] = useState(false);

  async function save() {
    const startIso = fromLocalInputValue(from);
    const endIso = fromLocalInputValue(to);
    if (!startIso || !endIso) {
      toast.error("Both times are needed.");
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      toast.error("The end has to be after the start.");
      return;
    }
    setSaving(true);
    const result = await logCompleted({
      familyId,
      type: "feed",
      kidId,
      startIso,
      endIso,
      payload: { method: "breast" },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await onSaved();
    toast.success("Feed logged");
  }

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <ManualRow label="From" value={from} onChange={setFrom} testId="manual-from" />
      <ManualRow label="To" value={to} onChange={setTo} testId="manual-to" />
      <button
        type="button"
        onClick={save}
        disabled={saving || !kidId}
        data-testid="manual-save"
        className="w-full rounded-xl bg-stone-800 px-3 py-2.5 text-sm text-white disabled:opacity-50"
      >
        Log it
      </button>
    </div>
  );
}

export function ManualRow({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</span>
      <input
        type="datetime-local"
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm tabular-nums text-stone-800 focus:outline-none"
      />
    </label>
  );
}
