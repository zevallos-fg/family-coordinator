"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { deleteWithUndo } from "@/lib/undo";
import { DETAIL_CHIPS, EVENT_LABEL, type BabyEvent, type BabyEventType } from "@/lib/baby/events";
import { eventDuration, eventSummary } from "@/lib/baby/summary";
import { formatTimeOfDay } from "@/lib/baby/format";
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
              key={e.id}
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
  const running = event.ended_at === null && event.event_type !== "diaper" && event.event_type !== "growth";
  const [startAt, setStartAt] = useState(() => toLocalInputValue(event.started_at));
  const [endAt, setEndAt] = useState(() => (event.ended_at ? toLocalInputValue(event.ended_at) : ""));
  const [saving, setSaving] = useState(false);

  const summary = eventSummary(event.event_type, payload);
  const duration = eventDuration(event.started_at, event.ended_at);

  /**
   * Every write goes through fn_baby_update rather than a direct table update:
   * the function is SECURITY INVOKER with a pinned search_path, so RLS decides,
   * and null arguments mean "leave alone" — which is what lets a running timer
   * have its start corrected without being stopped.
   */
  async function patch(args: {
    started_at?: string | null;
    ended_at?: string | null;
    payload?: Record<string, Json>;
  }) {
    setSaving(true);
    const supabase = createClient();
    // Cast because lib/supabase/database.types.ts is generated from the applied
    // schema, and 20260908120000_fn_baby_update.sql is not applied yet. Remove
    // this the moment types are regenerated after it lands — a permanent cast
    // here would hide a genuinely missing function behind a compile that passes.
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("fn_baby_update", {
      p_id: event.id,
      ...(args.started_at ? { p_started_at: args.started_at } : {}),
      ...(args.ended_at ? { p_ended_at: args.ended_at } : {}),
      ...(args.payload ? { p_payload: args.payload as never } : {}),
    });
    setSaving(false);
    if (error) {
      // 23514 is baby_events_interval_sane: an end before a start.
      toast.error(
        error.message.includes("interval_sane")
          ? "That would end before it starts."
          : "Couldn't save that change."
      );
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

  const groups = (DETAIL_CHIPS[event.event_type as BabyEventType] ?? []).filter(
    (g) => !g.showIf || g.showIf(payload)
  );

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
              if (iso) void patch({ started_at: iso });
            }}
          />

          {!running && (
            <TimeField
              label="Ended"
              value={endAt}
              testId="edit-ended-at"
              disabled={saving}
              onChange={setEndAt}
              onCommit={() => {
                const iso = fromLocalInputValue(endAt);
                if (iso) void patch({ ended_at: iso });
              }}
            />
          )}

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
        // Committed on blur and on change rather than behind a Save button: the
        // control is already a deliberate two-step interaction, and a row that
        // needs a second confirmation to fix a typo is a row nobody fixes.
        onBlur={onCommit}
        className="bg-transparent text-sm tabular-nums text-stone-800 focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
