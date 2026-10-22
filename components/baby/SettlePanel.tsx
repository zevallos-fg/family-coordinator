"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { logPoint, toggleTimer, updateEvent } from "@/lib/baby/write";
import { formatElapsed, secondsBetween } from "@/lib/baby/format";
import { startProblem } from "@/lib/baby/plausible";
import {
  MOODS,
  ON_HER_OWN,
  SOOTHE_METHODS,
  defaultWorked,
  fmtMin,
  methodLabel,
  toggleTry,
  type SettlePayload,
} from "@/lib/baby/settle";
import type { BabyEvent } from "@/lib/baby/events";
import type { Json } from "@/lib/supabase/database.types";

const chip = (on: boolean) =>
  `relative rounded-full px-4 py-2 text-sm ${on ? "bg-violet-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`;

/**
 * Settling, for every sleep: start when the trying starts, tap each thing as
 * it's tried (in order), say how it's going, and tap Asleep — the sleep starts
 * then, so sleep totals stay true, and the minutes it took and what worked are
 * kept with it. Built so one thumb can do it while the other arm is busy.
 */
export function SettlePanel({
  familyId,
  kidId,
  events,
  startInstant,
  onStartUsed,
  onStartSleep,
  disabled,
  onChanged,
}: {
  familyId: string;
  kidId: string | null;
  events: BabyEvent[];
  /** The page's START TIME control: null means now. */
  startInstant: () => string | null;
  onStartUsed: () => void;
  /** Already asleep: start the sleep timer without settling. */
  onStartSleep: () => void;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);

  const mine = (e: BabyEvent) => kidId === null || e.kid_id === kidId;
  const open = events.find((e) => e.event_type === "settle" && e.ended_at === null && mine(e)) ?? null;
  const lastWake = events
    .filter((e) => e.event_type === "sleep" && e.ended_at && mine(e))
    .map((e) => Date.parse(e.ended_at!))
    .sort((a, b) => b - a)[0];

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  const payload = (open?.payload ?? { tried: [] }) as unknown as SettlePayload;
  const tried = payload.tried ?? [];
  const settleStart = open ? Date.parse(open.started_at) : null;
  const awakeBefore = settleStart && lastWake && settleStart > lastWake ? Math.round((settleStart - lastWake) / 60_000) : null;

  async function save(next: SettlePayload) {
    if (!open) return;
    const result = await updateEvent({ id: open.id, payload: next as unknown as Record<string, Json> });
    if (!result.ok) toast.error(result.message);
    else await onChanged();
  }

  async function start() {
    if (!kidId || busy) return;
    const at = startInstant();
    const problem = startProblem(at, new Date().getTime());
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const result = await logPoint({ familyId, type: "settle", kidId, payload: { tried: [] }, at });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onStartUsed();
    setNowMs(Date.now());
    await onChanged();
  }

  async function asleep(worked: string) {
    if (!open || !kidId || busy) return;
    setBusy(true);
    const at = new Date().toISOString();
    // The sleep starts now, carrying the settling summary; the settle row then
    // closes at the same instant and points at it.
    const sleep = await toggleTimer({
      familyId,
      type: "sleep",
      kidId,
      at,
      payload: {
        settle_started_at: open.started_at,
        tried: tried.map((t) => t.method),
        worked,
        ...(payload.mood ? { mood: payload.mood } : {}),
        settle_id: open.id,
      },
    });
    if (!sleep.ok) {
      setBusy(false);
      toast.error(sleep.message);
      return;
    }
    const closed = await updateEvent({
      id: open.id,
      endedAt: at,
      payload: { ...payload, worked, outcome: "asleep", ...(sleep.id ? { sleep_id: sleep.id } : {}) } as unknown as Record<string, Json>,
    });
    setBusy(false);
    setChoosing(null);
    if (!closed.ok) toast.error("Asleep is logged, but the settling entry didn't close. Fix it in history.");
    else toast.success(`Asleep — settled in ${fmtMin(Math.round((Date.parse(at) - Date.parse(open.started_at)) / 60_000))}`);
    await onChanged();
  }

  async function stop() {
    if (!open || busy) return;
    setBusy(true);
    const result = await updateEvent({
      id: open.id,
      endedAt: new Date().toISOString(),
      payload: { ...payload, outcome: "stopped" } as unknown as Record<string, Json>,
    });
    setBusy(false);
    if (!result.ok) toast.error(result.message);
    else {
      toast("Settling stopped — kept as an attempt");
      await onChanged();
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled || busy}
          data-testid="settle-start"
          className="flex aspect-square w-full flex-col items-center justify-center rounded-full border-4 border-stone-200 bg-white active:bg-stone-50 disabled:opacity-50"
        >
          <span aria-hidden className="text-5xl">
            🌙
          </span>
          <span className="mt-3 text-3xl text-stone-900">Start settling</span>
          <span className="mt-2 text-sm text-stone-400">tap when you start putting them down</span>
        </button>
        <button
          type="button"
          onClick={onStartSleep}
          disabled={disabled || busy}
          data-testid="sleep-direct"
          className="w-full rounded-xl bg-white py-3 text-sm text-stone-700 ring-1 ring-stone-200 disabled:opacity-50"
        >
          Already asleep — start the sleep timer
        </button>
      </div>
    );
  }

  const elapsed = secondsBetween(open.started_at, nowMs) ?? 0;
  return (
    <section className="space-y-4 rounded-2xl border-4 border-violet-600 bg-white p-4" data-testid="settle-open">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-stone-400">Settling</p>
        <p className="text-5xl tabular-nums text-stone-900">{formatElapsed(elapsed)}</p>
        <p className="mt-1 text-xs text-stone-500">
          Since {new Date(open.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}
          {awakeBefore !== null ? ` · awake ${fmtMin(awakeBefore)} before` : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-stone-400">Trying — tap each, in order</p>
        <div className="flex flex-wrap gap-2">
          {SOOTHE_METHODS.map((m) => {
            const i = tried.findIndex((t) => t.method === m.value);
            return (
              <button
                key={m.value}
                type="button"
                data-testid={`settle-try-${m.value}`}
                aria-pressed={i >= 0}
                onClick={() => void save({ ...payload, tried: toggleTry(tried, m.value, new Date().toISOString()) })}
                className={chip(i >= 0)}
              >
                {i >= 0 && <span className="mr-1 text-xs opacity-80">{i + 1}.</span>}
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-stone-400">Going down</p>
        <div className="flex gap-2">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              data-testid={`settle-mood-${m.value}`}
              aria-pressed={payload.mood === m.value}
              onClick={() => void save({ ...payload, mood: payload.mood === m.value ? null : m.value })}
              className={chip(payload.mood === m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {choosing !== null ? (
        <div className="space-y-2 rounded-xl bg-stone-100 p-3" data-testid="settle-worked">
          <p className="text-sm text-stone-800">What worked?</p>
          <div className="flex flex-wrap gap-2">
            {[...tried.map((t) => t.method), ON_HER_OWN].map((v) => (
              <button key={v} type="button" onClick={() => setChoosing(v)} aria-pressed={choosing === v} className={chip(choosing === v)}>
                {methodLabel(v)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void asleep(choosing)}
            disabled={busy}
            data-testid="settle-worked-save"
            className="w-full rounded-xl bg-violet-600 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            Asleep
          </button>
        </div>
      ) : (
        <button
          type="button"
          // Two or more tried: ask which one did it (the last is preselected).
          onClick={() => (tried.length >= 2 ? setChoosing(defaultWorked(tried)) : void asleep(defaultWorked(tried)))}
          disabled={busy}
          data-testid="settle-asleep"
          className="w-full rounded-xl bg-violet-600 py-4 text-lg font-medium text-white disabled:opacity-50"
        >
          Asleep
        </button>
      )}
      <button type="button" onClick={() => void stop()} disabled={busy} className="w-full text-sm text-stone-500" data-testid="settle-stop">
        Stop — not asleep
      </button>
    </section>
  );
}
