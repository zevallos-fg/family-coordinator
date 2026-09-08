"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isBackdated, toLocalInputValue } from "@/lib/baby/time-input";
import type { Kid } from "./useBabyLane";

interface Props {
  title: string;
  /** Back/close target. Every page is reachable directly, so this is a link. */
  closeHref?: string;
  familyId: string;
  kids: Kid[];
  kidId: string | null;
  onChooseKid: (id: string) => void;
  /** Sub-mode switch — Nursing|Bottle, Diaper|Potty. Omitted where there is none. */
  segmented?: ReactNode;
  /** The START TIME control's value, `YYYY-MM-DDTHH:mm` in local time. */
  startAt: string;
  onStartAt: (value: string) => void;
  /** What a reminder for this page would be called, e.g. "Feed". */
  reminderLabel: string;
  blockedReason?: ReactNode;
  /** The action buttons. Deliberately the whole body of the page. */
  children: ReactNode;
  /** Expanded by the "Manual entry" link at the bottom. */
  manualEntry?: ReactNode;
}

const REMINDER_OFFSETS = [1, 2, 3, 4] as const;

/**
 * The skeleton every baby page shares.
 *
 * Header, sub-mode toggle, start time, body, manual entry — in that order, on
 * every route, so muscle memory transfers between them. The bottom nav is the
 * app shell's and persists underneath, which is most of why these are pages and
 * not a sheet: a sheet cannot be deep-linked, loses its state when dismissed, and
 * puts the timer and the time editor in the same overlay fighting for room.
 */
export function BabyPageShell({
  title,
  closeHref = "/baby",
  familyId,
  kids,
  kidId,
  onChooseKid,
  segmented,
  startAt,
  onStartAt,
  reminderLabel,
  blockedReason,
  children,
  manualEntry,
}: Props) {
  const [manualOpen, setManualOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [reminding, setReminding] = useState(false);

  /**
   * "Remind me" writes a task due at the chosen offset.
   *
   * Deliberately a row rather than a notification: this app has no push
   * infrastructure, and a reminder that exists only in a service worker is one
   * that silently stops working. A task lands in v_whats_due, which is already
   * the surface the family looks at, and survives the phone being replaced.
   */
  async function remindIn(hours: number) {
    setReminding(true);
    const supabase = createClient();
    // `new Date()` rather than Date.now(): react-hooks/purity flags the latter
    // anywhere it cannot prove it is outside render, and this is the same fix
    // already applied to the nursing timer.
    const due = new Date();
    due.setHours(due.getHours() + hours);
    const dueAt = due.toISOString();
    const { error } = await supabase.from("tasks").insert({
      family_id: familyId,
      title: `${reminderLabel}`,
      due_at: dueAt,
      status: "open",
    });
    setReminding(false);
    setRemindOpen(false);
    if (error) {
      toast.error("Couldn't set that reminder.");
      return;
    }
    toast.success(`${reminderLabel} reminder in ${hours}h`);
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Link
          href={closeHref}
          aria-label="Close"
          data-testid="baby-close"
          className="-ml-1 rounded-full p-2 text-stone-400 active:bg-stone-100"
        >
          <span aria-hidden className="text-xl leading-none">
            ✕
          </span>
        </Link>

        <h1 className="text-base font-medium text-stone-800">{title}</h1>

        <div className="relative">
          <button
            type="button"
            data-testid="baby-remind"
            onClick={() => setRemindOpen((v) => !v)}
            className="rounded-full px-3 py-2 text-xs text-stone-500 active:bg-stone-100"
          >
            Remind me
          </button>
          {remindOpen && (
            <div className="absolute right-0 z-10 mt-1 flex gap-1 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
              {REMINDER_OFFSETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={reminding}
                  data-testid={`baby-remind-${h}h`}
                  onClick={() => remindIn(h)}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-stone-700 active:bg-stone-100 disabled:opacity-40"
                >
                  {h}h
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Shown even for one kid. This family already has an older child, so a
          screen that silently defaulted to whoever sorted first would file the
          newborn's feeds under their sibling. */}
      {kids.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stone-400">Logging for</span>
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              data-testid={`baby-kid-${k.id}`}
              onClick={() => onChooseKid(k.id)}
              className={`rounded-full px-3 py-1 text-xs ${
                kidId === k.id
                  ? "bg-stone-800 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200"
              }`}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      {segmented}

      {blockedReason && (
        <p
          data-testid="baby-blocked"
          className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-100"
        >
          {blockedReason}
        </p>
      )}

      {/* START TIME. Always visible, always one tap from editable. The export
          shows entries are routinely written up after the fact, so "now" is a
          default rather than an assumption. */}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
          Start time
        </span>
        <span className="flex items-center gap-2">
          {isBackdated(startAt) && (
            <button
              type="button"
              data-testid="baby-start-now"
              onClick={() => onStartAt(toLocalInputValue())}
              className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500"
            >
              now
            </button>
          )}
          <input
            type="datetime-local"
            data-testid="baby-start-at"
            value={startAt}
            onChange={(e) => onStartAt(e.target.value)}
            className="bg-transparent text-sm tabular-nums text-stone-800 focus:outline-none"
          />
        </span>
      </label>

      {children}

      {manualEntry && (
        <div className="pt-2">
          <button
            type="button"
            data-testid="baby-manual-toggle"
            onClick={() => setManualOpen((v) => !v)}
            className="w-full rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-xs text-stone-500 active:bg-stone-50"
          >
            {manualOpen ? "Hide manual entry" : "Manual entry"}
          </button>
          {manualOpen && <div className="mt-3">{manualEntry}</div>}
        </div>
      )}
    </div>
  );
}
