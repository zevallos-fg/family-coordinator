"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteWithUndo } from "@/lib/undo";
import { updateEvent } from "@/lib/baby/write";
import { EVENT_LABEL, visibleChipGroups, type BabyEvent } from "@/lib/baby/events";
import { eventDuration, eventSummary } from "@/lib/baby/summary";
import { formatClock, formatTimeOfDay } from "@/lib/baby/format";
import {
  SIDE_LABEL,
  hasSpellStamps,
  planSideEdit,
  runningSeconds,
  segmentsOf,
  sideTotals,
  type FeedPayload,
  type NursingSide,
} from "@/lib/baby/nursing";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import type { Json } from "@/lib/supabase/database.types";

interface Props {
  events: BabyEvent[];
  /** Which type this page is about. Rows of other types are not shown. */
  type: string;
  onChanged: () => void;
  limit?: number;
}

/**
 * REVIEW and EDIT — the two zones that did not exist.
 *
 * The lane could log and delete but never correct, so a feed started at the
 * wrong time could only be removed and re-entered. Every row here opens in
 * place: start, end, detail chips, delete. No modal, no navigation, nothing that
 * loses the page you were on.
 *
 * Editing a start time edits WHEN IT HAPPENED. It is never re-stamped to the
 * moment of the edit, which is the whole reason someone opens this at all — they
 * are fixing a 3am feed at 7am.
 */
export function RecentList({ events, type, onChanged, limit = 10 }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = events.filter((e) => e.event_type === type).slice(0, limit);

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">Recent</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-stone-400">No entries yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {rows.map((e) => (
            <RecentRow
              // Keyed on the times as well as the id. The row copies started/ended
              // into local state when it mounts; keyed on id alone it kept the
              // values from before a timer was stopped, so "Ended" stayed blank.
              // A new key remounts it with what the database now says. The open
              // row stays open because openId lives up here, keyed on id.
              key={`${e.id}:${e.started_at}:${e.ended_at ?? ""}`}
              event={e}
              open={openId === e.id}
              onToggle={() => setOpenId((c) => (c === e.id ? null : e.id))}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRow({
  event,
  open,
  onToggle,
  onChanged,
}: {
  event: BabyEvent;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const payload = (event.payload ?? {}) as Record<string, Json>;
  // Diapers and growth are instants: they have a start and never an end, so
  // they get no "Ended" field rather than one that is always empty.
  const isPoint = event.event_type === "diaper" || event.event_type === "growth";
  const running = event.ended_at === null && !isPoint;
  const [startAt, setStartAt] = useState(() => toLocalInputValue(event.started_at));
  const [endAt, setEndAt] = useState(() => (event.ended_at ? toLocalInputValue(event.ended_at) : ""));
  const [saving, setSaving] = useState(false);
  // The instant the row was opened: a side still running is shown with its total
  // as of then, rather than ticking under someone's thumb while they type.
  // Adjusted during render on the closed→open edge (React's documented pattern
  // for state derived from a prop change), not in an effect.
  const [openedAtMs, setOpenedAtMs] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenedAtMs(new Date().getTime());
  }

  const summary = eventSummary(event.event_type, payload);
  // A breast feed's length is Left + Right, never end − start.
  const duration = eventDuration(event);

  /**
   * Corrections go through lib/baby/write.ts, which calls fn_baby_update rather
   * than updating the table: an omitted field means "leave alone", which is what
   * lets a running timer have its start corrected without being stopped.
   */
  async function patch(args: {
    startedAt?: string;
    endedAt?: string;
    payload?: Record<string, Json> | FeedPayload;
  }) {
    setSaving(true);
    const result = await updateEvent({ id: event.id, ...args });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onChanged();
  }

  async function remove() {
    await deleteWithUndo({
      table: "baby_events",
      ids: [event.id],
      message: `${EVENT_LABEL[event.event_type] ?? "Entry"} removed`,
      // The list is server-derived, so both directions are a refetch. The row
      // comes back with its payload intact because fn_soft_delete keeps the
      // whole row, not a reconstruction of it.
      onShow: onChanged,
      onHide: onChanged,
      onSettled: onChanged,
    });
  }

  const groups = visibleChipGroups(event.event_type, payload);

  // Any nursing session — finished or still open — can have each side's time
  // corrected. Bottles have no sides. On an open feed a side left running is
  // shown with its live total at the moment the row was opened, and saving
  // stops it (planSideEdit banks it first).
  const feed = payload as FeedPayload;
  const nursing =
    event.event_type === "feed" && feed.method !== "bottle" && typeof feed.volume_ml !== "number";
  const banked = sideTotals(segmentsOf(feed));
  const live = running && feed.running ? feed.running : null;
  const totals = {
    L: banked.L + (live?.side === "L" ? runningSeconds(feed, openedAtMs) : 0),
    R: banked.R + (live?.side === "R" ? runningSeconds(feed, openedAtMs) : 0),
  };
  // Once spells carry their stop instant, the end is derived from them and
  // typing over it would only make the two disagree. Legacy rows keep the field.
  const endDerived = nursing && hasSpellStamps(feed);

  /**
   * Which spell moves, and whether the end moves with it, is planSideEdit's
   * decision — tested there, not here. Returns false when nothing was written,
   * so the field can go back to what the row really holds.
   */
  function saveSide(side: NursingSide, input: string): boolean {
    const plan = planSideEdit(
      { started_at: event.started_at, ended_at: event.ended_at, payload: feed },
      side,
      input
    );
    if (plan.kind === "refuse") toast.error(plan.message);
    if (plan.kind !== "write") return false;
    void patch({ payload: plan.payload, ...(plan.endedAt ? { endedAt: plan.endedAt } : {}) });
    return true;
  }

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        data-testid={`recent-row-${event.id}`}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left active:bg-stone-50"
      >
        <span className="min-w-0">
          <span className="text-sm text-stone-800">{formatTimeOfDay(event.started_at)}</span>
          {summary && <span className="ml-2 text-xs text-stone-500">{summary}</span>}
        </span>
        <span className="shrink-0 text-xs text-stone-400">
          {running ? "running" : (duration ?? "")}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-stone-100 bg-stone-50 px-3 py-3">
          <TimeField
            label="Started"
            value={startAt}
            testId="edit-started-at"
            disabled={saving}
            onChange={setStartAt}
            onCommit={() => {
              const iso = fromLocalInputValue(startAt);
              // Only the start is sent. A running event keeps ended_at null and
              // keeps running — correcting a start must never require stopping.
              if (iso) void patch({ startedAt: iso });
            }}
          />

          {endDerived && event.ended_at && (
            <div className="flex items-center justify-between gap-3" data-testid="edit-ended-at-derived">
              <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Ended</span>
              <span className="text-sm tabular-nums text-stone-500">{formatTimeOfDay(event.ended_at)}</span>
            </div>
          )}

          {!running && !isPoint && !endDerived && (
            <TimeField
              label="Ended"
              value={endAt}
              testId="edit-ended-at"
              disabled={saving}
              onChange={setEndAt}
              onCommit={() => {
                const iso = fromLocalInputValue(endAt);
                if (iso) void patch({ endedAt: iso });
              }}
            />
          )}

          {nursing &&
            (["L", "R"] as const).map((side) => (
              <SideField
                // Remounts with the saved value after every write.
                key={`${side}:${banked[side]}:${live?.since ?? ""}`}
                label={SIDE_LABEL[side]}
                seconds={totals[side]}
                testId={`edit-side-${side}`}
                disabled={saving}
                onSave={(input) => saveSide(side, input)}
              />
            ))}

          {groups.map((group) => {
            const current = payload[group.key] as string | undefined;
            return (
              <div key={group.key} className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-stone-400">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={saving}
                      data-testid={`edit-chip-${group.key}-${option}`}
                      onClick={() =>
                        // Tapping the answer again clears it. Nothing is
                        // required, and a wrong chip must be as cheap to undo as
                        // it was to set — which is why the payload is replaced
                        // wholesale rather than merged.
                        void patch({
                          payload: { ...payload, [group.key]: current === option ? null : option },
                        })
                      }
                      className={`rounded-full px-3 py-1.5 text-xs disabled:opacity-50 ${
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

          <button
            type="button"
            onClick={remove}
            data-testid="edit-delete"
            className="text-xs text-rose-600 underline underline-offset-2"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function TimeField({
  label,
  value,
  testId,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  testId: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</span>
      <input
        type="datetime-local"
        value={value}
        data-testid={testId}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        // Committed on blur rather than behind a Save button: a row that needs a
        // second confirmation to fix a typo is a row nobody fixes. Blur is the
        // commit point on mobile, where the native picker closes in one step.
        onBlur={onCommit}
        className="bg-transparent text-sm tabular-nums text-stone-800 focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}

/**
 * One side's total, typed rather than picked: "10", "10:00" or "10m 0s". Saved
 * with a button, not on blur — a correction to a feed's length is deliberate,
 * and a stray tap away mid-edit must not rewrite it.
 */
function SideField({
  label,
  seconds,
  testId,
  disabled,
  onSave,
}: {
  label: string;
  seconds: number;
  testId: string;
  disabled: boolean;
  onSave: (input: string) => boolean;
}) {
  const shown = formatClock(seconds);
  const [value, setValue] = useState(shown);
  const save = () => {
    if (!onSave(value)) setValue(shown);
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={testId} className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {label}
      </label>
      <span className="flex items-center gap-2">
        <input
          id={testId}
          type="text"
          value={value}
          data-testid={testId}
          disabled={disabled}
          placeholder="mm:ss"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          className="w-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-right text-sm tabular-nums text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={disabled || value.trim() === shown}
          data-testid={`${testId}-save`}
          className="rounded-lg bg-stone-800 px-3 py-1 text-xs text-white disabled:opacity-40"
        >
          Save
        </button>
      </span>
    </div>
  );
}
