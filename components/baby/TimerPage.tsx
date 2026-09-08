"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BabyPageShell } from "./BabyPageShell";
import { RecentList } from "./RecentList";
import { ManualRow } from "./FeedPage";
import { useBabyLane } from "./useBabyLane";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import { logCompleted, toggleTimer } from "@/lib/baby/write";
import { DETAIL_CHIPS, type BabyEventType } from "@/lib/baby/events";
import { formatClock, secondsBetween } from "@/lib/baby/format";
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
  const [startAt, setStartAt] = useState(() => toLocalInputValue());
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
    setPending(true);
    const result = await toggleTimer({
      familyId,
      type,
      kidId: lane.kidId,
      // Only meaningful when starting: fn_baby_toggle ignores it when closing an
      // open row, which is why the control resets to now after a stop.
      at: open ? null : fromLocalInputValue(startAt),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await lane.refresh();
    if (open) setStartAt(toLocalInputValue());
  }

  async function setDetail(key: string, value: string | null) {
    const target = open ?? lane.events.find((e) => e.event_type === type);
    if (!target) return;
    const current = (target.payload ?? {}) as Record<string, Json>;
    const supabase = createClient();
    const { error } = await supabase
      .from("baby_events")
      .update({ payload: { ...current, [key]: value } as never })
      .eq("id", target.id);
    if (error) toast.error("Couldn't save that detail.");
    else await lane.refresh();
  }

  const elapsed = open ? (secondsBetween(open.started_at, nowMs) ?? 0) : 0;
  const latest = open ?? lane.events.find((e) => e.event_type === type) ?? null;
  const payload = (latest?.payload ?? {}) as Record<string, Json>;
  const groups = DETAIL_CHIPS[type].filter((g) => !g.showIf || g.showIf(payload));

  return (
    <BabyPageShell
      title={title}
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={startAt}
      onStartAt={setStartAt}
      reminderLabel={title}
      blockedReason={blocked}
      manualEntry={
        <ManualTimerEntry familyId={familyId} type={type} kidId={lane.kidId} onSaved={lane.refresh} />
      }
    >
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
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
      <RecentList events={lane.events} type={type} onChanged={lane.refresh} />
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
    const result = await logCompleted({ familyId, type, kidId, startIso, endIso });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await onSaved();
    toast.success("Logged");
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
