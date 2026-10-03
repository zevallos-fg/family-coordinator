"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BabyPageShell } from "./BabyPageShell";
import { EventHistory, laneKey } from "./EventHistory";
import { useBabyLane } from "./useBabyLane";
import { useStartTime } from "./useStartTime";
import { BottleFields, useBottleUnit } from "./BottleFields";
import { bottlePayload, manualBreastFeed, parseAmount } from "@/lib/baby/bottle";
import type { Json } from "@/lib/supabase/database.types";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import { logCompleted, updateEvent } from "@/lib/baby/write";
import {
  SIDE_LABEL,
  displaySeconds,
  finishSession,
  formatDuration,
  parseSideDuration,
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
  const start = useStartTime();
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
  async function write(next: FeedPayload, opts?: { end?: string }) {
    if (blocked || !lane.kidId) return;
    setPending(true);
    const supabase = createClient();

    if (!open) {
      const { error } = await supabase.rpc("fn_baby_log", {
        p_family_id: familyId,
        p_event_type: "feed",
        p_kid_id: lane.kidId,
        p_payload: next as never,
        // Omitted unless edited: the server's now() is to the second.
        ...(start.instant() ? { p_at: start.instant()! } : {}),
      });
      setPending(false);
      if (error) {
        toast.error("Couldn't start that timer.");
        return;
      }
    } else {
      const result = await updateEvent({
        id: open.id,
        payload: next,
        ...(opts?.end ? { endedAt: opts.end } : {}),
      });
      setPending(false);
      if (!result.ok) {
        // Saying nothing here would leave a timer that looks like it is running
        // and a database that never heard about it.
        toast.error("Couldn't save that — the timer may not be recorded.");
        return;
      }
    }
    await lane.refresh();
    if (opts?.end) start.reset();
  }

  function tapSide(side: NursingSide) {
    const nowIso = new Date().toISOString();
    if (running?.side === side) void write(stopRunning(payload, Date.parse(nowIso)));
    else void write(startSide(payload, side, nowIso));
  }

  function finish() {
    // The feed ends when its last side stopped, not when Done was tapped.
    const done = finishSession(payload, new Date().toISOString());
    void write(done.payload, { end: done.endedAt });
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
      startAt={start.value}
      onStartAt={start.set}
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
          startIso={start.instant()}
          disabled={!!blocked || !lane.kidId}
          onSaved={async () => {
            await lane.refresh();
            start.reset();
          }}
        />
      )}

      <EventHistory
        familyId={familyId}
        kidId={lane.kidId}
        type="feed"
        refreshKey={laneKey(lane.events)}
        onChanged={lane.refresh}
      />
    </BabyPageShell>
  );
}

/**
 * Bottles: amount in ml, oz or g, and contents.
 *
 * Written as a FINISHED row (ended_at = started_at). A bottle has no duration,
 * and a feed row left with ended_at null is, to every other screen, a nursing
 * session still in progress — it would have taken over the nursing circles and
 * shown as running on /now.
 *
 * `contents` is free text with a suggestion rather than an enum: the export's
 * most common value is "Breast Milk", and a fixed list would have to guess.
 */
function BottleForm({
  familyId,
  kidId,
  startIso,
  disabled,
  onSaved,
}: {
  familyId: string;
  kidId: string | null;
  /** Null means "now". */
  startIso: string | null;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useBottleUnit(familyId);
  const [contents, setContents] = useState("Breast Milk");
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = parseAmount(amount);
    if (value === null) {
      toast.error(`How many ${unit}?`);
      return;
    }
    const at = startIso ?? new Date().toISOString();
    setSaving(true);
    const result = await logCompleted({
      familyId,
      type: "feed",
      kidId,
      startIso: at,
      endIso: at,
      payload: bottlePayload(value, unit, contents) as Record<string, Json>,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setAmount("");
    await onSaved();
    toast.success("Bottle logged");
  }

  return (
    <section className="space-y-4">
      <BottleFields
        amount={amount}
        onAmount={setAmount}
        unit={unit}
        onUnit={setUnit}
        contents={contents}
        onContents={setContents}
        testPrefix="bottle"
      />
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

type ManualKind = "breast" | "bottle";

/**
 * A feed that already happened, of either kind.
 *
 * Breast: start time, Left and Right durations, and which side came first. The
 * spells are laid end to end and stamped, so the row is indistinguishable from a
 * timed one — total is Left + Right, Ended is when the last side stopped, and
 * the sides stay editable in Recent.
 *
 * Bottle: a time, an amount in ml/oz/g, contents.
 */
function ManualFeed({
  familyId,
  kidId,
  onSaved,
}: {
  familyId: string;
  kidId: string | null;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<ManualKind>("breast");
  const [at, setAt] = useState(() => toLocalInputValue(new Date(Date.now() - 30 * 60_000)));
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [first, setFirst] = useState<NursingSide>("L");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useBottleUnit(familyId);
  const [contents, setContents] = useState("Breast Milk");
  const [saving, setSaving] = useState(false);

  async function save() {
    const startIso = fromLocalInputValue(at);
    if (!startIso) {
      toast.error("When was it?");
      return;
    }

    let result;
    if (kind === "breast") {
      // Blank means that side wasn't used; anything typed must be readable.
      const l = left.trim() === "" ? 0 : parseSideDuration(left);
      const r = right.trim() === "" ? 0 : parseSideDuration(right);
      if (l === null || r === null) {
        toast.error("Use minutes, like 10 or 10:30.");
        return;
      }
      const feed = manualBreastFeed(startIso, { L: l, R: r }, first);
      if (!feed) {
        toast.error("Enter at least one side.");
        return;
      }
      setSaving(true);
      result = await logCompleted({
        familyId,
        type: "feed",
        kidId,
        startIso,
        endIso: feed.endIso,
        payload: feed.payload as Record<string, Json>,
      });
    } else {
      const value = parseAmount(amount);
      if (value === null) {
        toast.error(`How many ${unit}?`);
        return;
      }
      setSaving(true);
      result = await logCompleted({
        familyId,
        type: "feed",
        kidId,
        startIso,
        endIso: startIso,
        payload: bottlePayload(value, unit, contents) as Record<string, Json>,
      });
    }
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setLeft("");
    setRight("");
    setAmount("");
    await onSaved();
    toast.success(kind === "breast" ? "Feed logged" : "Bottle logged");
  }

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
        {(["breast", "bottle"] as ManualKind[]).map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`manual-kind-${k}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-lg py-2 text-sm capitalize ${
              kind === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
            }`}
          >
            {k === "breast" ? "Nursing" : "Bottle"}
          </button>
        ))}
      </div>

      <ManualRow
        label={kind === "breast" ? "Started" : "When"}
        value={at}
        onChange={setAt}
        testId="manual-from"
      />

      {kind === "breast" ? (
        <>
          {(["L", "R"] as NursingSide[]).map((side) => (
            <label key={side} className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                {SIDE_LABEL[side]} (min)
              </span>
              <input
                inputMode="decimal"
                value={side === "L" ? left : right}
                data-testid={`manual-side-${side}`}
                onChange={(e) => (side === "L" ? setLeft : setRight)(e.target.value)}
                placeholder="0"
                className="w-24 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-stone-800 focus:outline-none"
              />
            </label>
          ))}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              First side
            </span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              {(["L", "R"] as NursingSide[]).map((side) => (
                <button
                  key={side}
                  type="button"
                  data-testid={`manual-first-${side}`}
                  aria-pressed={first === side}
                  onClick={() => setFirst(side)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    first === side ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
                  }`}
                >
                  {SIDE_LABEL[side]}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <BottleFields
          amount={amount}
          onAmount={setAmount}
          unit={unit}
          onUnit={setUnit}
          contents={contents}
          onContents={setContents}
          testPrefix="manual-bottle"
        />
      )}

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
