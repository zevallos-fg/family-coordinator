"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BabyPageShell } from "./BabyPageShell";
import { EventHistory, laneKey } from "./EventHistory";
import { ManualRow } from "./FeedPage";
import { useBabyLane } from "./useBabyLane";
import { useStartTime } from "./useStartTime";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import { logCompleted, toggleTimer, updateEvent } from "@/lib/baby/write";
import { visibleChipGroups, type BabyEventType } from "@/lib/baby/events";
import { formatClock, secondsBetween } from "@/lib/baby/format";
import { AAP_SAFE_SLEEP } from "@/lib/baby/glance";
import { spanProblem, startProblem } from "@/lib/baby/plausible";
import { MOODS, SOOTHE_METHODS, ON_HER_OWN, SettleError, fmtMin, methodLabel, moodLabel, sleepSettleFields } from "@/lib/baby/settle";
import { SettlePanel } from "./SettlePanel";
import type { Json } from "@/lib/supabase/database.types";

/**
 * One timer, one button, and chips only if the export says they were used.
 *
 * Sleep gets exactly one location chip. Start location was filled 6 times in
 * 1,800 sleeps; start condition and end condition were filled 0 times out of
 * 1,800. Building mood pickers or how-it-happened selectors would be copying UI
 * that was never used once in three years — so this page does not have them, and
 * the restraint is the feature.
 */
export function TimerPage({
  familyId,
  type,
  title,
  emoji,
}: {
  familyId: string;
  type: Extract<BabyEventType, "sleep" | "pump">;
  title: string;
  emoji: string;
}) {
  const lane = useBabyLane(familyId);
  const start = useStartTime();
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const open = lane.events.find(
    (e) => e.event_type === type && e.ended_at === null && (lane.kidId === null || e.kid_id === lane.kidId)
  );

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const blocked =
    !lane.loading && lane.kids.length === 0 ? (
      <>
        No child record yet, so {title.toLowerCase()} has nowhere to go.{" "}
        <Link href="/caregiver/kids/new" className="underline underline-offset-2">
          Add the baby
        </Link>
        .
      </>
    ) : null;

  async function toggle() {
    if (blocked || !lane.kidId) return;
    if (!open) {
      const problem = startProblem(start.instant(), Date.now());
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    setPending(true);
    const result = await toggleTimer({
      familyId,
      type,
      kidId: lane.kidId,
      // Only meaningful when starting, and only when someone changed the start
      // time. Untouched, p_at is omitted and the server stamps now() to the
      // second — the control's minute resolution is what made a new timer open
      // at 0:49 instead of 0:00.
      at: open ? null : start.instant(),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    // The clock's "now" froze when the last timer stopped. Refresh it before the
    // new row renders so the first frame is not measured against a stale tick.
    setNowMs(Date.now());
    await lane.refresh();
    start.reset();
  }

  async function setDetail(key: string, value: string | null) {
    const target = open ?? lane.events.find((e) => e.event_type === type);
    if (!target) return;
    const current = (target.payload ?? {}) as Record<string, Json>;
    const result = await updateEvent({ id: target.id, payload: { ...current, [key]: value } });
    if (!result.ok) toast.error(result.message);
    else await lane.refresh();
  }

  const elapsed = open ? (secondsBetween(open.started_at, nowMs) ?? 0) : 0;
  const latest = open ?? lane.events.find((e) => e.event_type === type) ?? null;
  const payload = (latest?.payload ?? {}) as Record<string, Json>;
  const groups = visibleChipGroups(type, payload);

  return (
    <BabyPageShell
      title={title}
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={start.value}
      onStartAt={start.set}
      reminderLabel={title}
      blockedReason={blocked}
      manualEntry={
        <ManualTimerEntry familyId={familyId} type={type} kidId={lane.kidId} onSaved={lane.refresh} />
      }
    >
      {type === "sleep" && !open ? (
        <SettlePanel
          familyId={familyId}
          kidId={lane.kidId}
          events={lane.events}
          startInstant={start.instant}
          onStartUsed={start.reset}
          onStartSleep={() => void toggle()}
          disabled={pending || !!blocked || !lane.kidId}
          onChanged={lane.refresh}
        />
      ) : (
      <button
        type="button"
        onClick={toggle}
        disabled={pending || !!blocked || !lane.kidId}
        data-testid={`${type}-toggle`}
        data-running={open ? "true" : "false"}
        aria-pressed={!!open}
        className={`flex aspect-square w-full flex-col items-center justify-center rounded-full border-4 transition-colors disabled:opacity-50 ${
          open ? "border-rose-400 bg-rose-50" : "border-stone-200 bg-white active:bg-stone-50"
        }`}
      >
        <span aria-hidden className="text-5xl">
          {emoji}
        </span>
        <span className="mt-3 text-5xl tabular-nums text-stone-900">
          {open ? formatClock(elapsed) : "Start"}
        </span>
        <span className="mt-2 text-sm text-stone-400">
          {open ? "tap to stop" : `tap to start ${title.toLowerCase()}`}
        </span>
      </button>
      )}
      {type === "sleep" && open && typeof payload.settle_started_at === "string" && (
        <p className="text-center text-sm text-stone-600" data-testid="sleep-settled">
          Settled in {fmtMin(Math.round((Date.parse(open.started_at) - Date.parse(payload.settle_started_at)) / 60_000))}
          {typeof payload.worked === "string" ? ` · ${methodLabel(payload.worked)}` : ""}
          {typeof payload.mood === "string" ? ` · ${moodLabel(payload.mood)}` : ""}
        </p>
      )}

      {type === "sleep" && (
        <Link href="/baby/sleep/patterns" className="block text-center text-sm text-violet-600" data-testid="sleep-patterns-link">
          Settling patterns →
        </Link>
      )}

      {latest && groups.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
          {groups.map((group) => {
            const current = payload[group.key] as string | undefined;
            return (
              <div key={group.key} className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-stone-400">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-testid={`chip-${group.key}-${option}`}
                      onClick={() => setDetail(group.key, current === option ? null : option)}
                      className={`rounded-full px-4 py-2 text-sm ${
                        current === option
                          ? "bg-stone-800 text-white"
                          : "bg-white text-stone-600 ring-1 ring-stone-200"
                      }`}
                    >
                      {group.optionLabels?.[option] ?? option}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {type === "sleep" && payload.location === "co-sleep" && (
            <p className="text-xs text-stone-500" data-testid="co-sleep-note">
              If that means the same bed: the AAP advises the same room, not the same bed, for at least the first six months.{" "}
              <a href={AAP_SAFE_SLEEP.url} target="_blank" rel="noreferrer" className="text-amber-700 underline underline-offset-2">
                AAP safe sleep
              </a>
            </p>
          )}
        </section>
      )}
      <EventHistory
        familyId={familyId}
        kidId={lane.kidId}
        type={type}
        refreshKey={laneKey(lane.events)}
        onChanged={lane.refresh}
      />
    </BabyPageShell>
  );
}

function ManualTimerEntry({
  familyId,
  type,
  kidId,
  onSaved,
}: {
  familyId: string;
  type: string;
  kidId: string | null;
  onSaved: () => Promise<void>;
}) {
  const [from, setFrom] = useState(() => toLocalInputValue(new Date(Date.now() - 60 * 60_000)));
  const [to, setTo] = useState(() => toLocalInputValue());
  const [saving, setSaving] = useState(false);
  // Sleep only: the settling that came before it, entered after the fact.
  const [settleFrom, setSettleFrom] = useState<string | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const [worked, setWorked] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const isSleep = type === "sleep";

  async function save() {
    const startIso = fromLocalInputValue(from);
    const endIso = fromLocalInputValue(to);
    const problem = !startIso || !endIso ? "Both times are needed." : spanProblem(startIso, endIso);
    if (problem || !startIso || !endIso) {
      toast.error(problem ?? "Both times are needed.");
      return;
    }
    let payload: Record<string, Json> | undefined;
    if (isSleep) {
      try {
        payload = sleepSettleFields({
          settleStartedAt: settleFrom ? fromLocalInputValue(settleFrom) : null,
          asleepAt: startIso,
          tried,
          worked: worked ?? (tried.length ? tried[tried.length - 1] : null),
          mood,
        });
      } catch (e) {
        toast.error(e instanceof SettleError ? e.message : "Check the settling times.");
        return;
      }
    }
    setSaving(true);
    const result = await logCompleted({ familyId, type, kidId, startIso, endIso, payload });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await onSaved();
    toast.success("Logged");
    setSettleFrom(null);
    setTried([]);
    setWorked(null);
    setMood(null);
  }

  const small = (on: boolean) => `rounded-full px-3 py-1.5 text-xs ${on ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-700"}`;

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      {isSleep && settleFrom !== null && (
        <ManualRow label="Started settling" value={settleFrom} onChange={setSettleFrom} testId="manual-settle-from" />
      )}
      <ManualRow label={isSleep ? "Asleep at" : "From"} value={from} onChange={setFrom} testId="manual-from" />
      <ManualRow label={isSleep ? "Woke at" : "To"} value={to} onChange={setTo} testId="manual-to" />
      {isSleep && settleFrom === null && (
        <button
          type="button"
          onClick={() => setSettleFrom(toLocalInputValue(new Date((Date.parse(fromLocalInputValue(from) ?? "") || Date.now()) - 15 * 60_000)))}
          className="text-xs text-violet-600"
          data-testid="manual-settle-add"
        >
          + Add settling (when you started, what you tried)
        </button>
      )}
      {isSleep && settleFrom !== null && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-stone-400">Tried, in order</p>
          <div className="flex flex-wrap gap-1.5">
            {SOOTHE_METHODS.map((m) => {
              const i = tried.indexOf(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={i >= 0}
                  onClick={() => setTried((t) => (t.includes(m.value) ? t.filter((x) => x !== m.value) : [...t, m.value]))}
                  className={small(i >= 0)}
                >
                  {i >= 0 ? `${i + 1}. ` : ""}
                  {m.label}
                </button>
              );
            })}
          </div>
          {tried.length > 0 && (
            <>
              <p className="text-[11px] uppercase tracking-wide text-stone-400">What worked</p>
              <div className="flex flex-wrap gap-1.5">
                {[...tried, ON_HER_OWN].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={(worked ?? tried[tried.length - 1]) === v}
                    onClick={() => setWorked(v)}
                    className={small((worked ?? tried[tried.length - 1]) === v)}
                  >
                    {methodLabel(v)}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-[11px] uppercase tracking-wide text-stone-400">Going down</p>
          <div className="flex gap-1.5">
            {MOODS.map((m) => (
              <button key={m.value} type="button" aria-pressed={mood === m.value} onClick={() => setMood(mood === m.value ? null : m.value)} className={small(mood === m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
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
