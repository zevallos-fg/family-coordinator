"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { deleteWithUndo } from "@/lib/undo";
import {
  DETAIL_CHIPS,
  EVENT_LABEL,
  type BabyEvent,
  type BabyEventType,
} from "@/lib/baby/events";
import { formatDuration, formatTimeOfDay, secondsBetween } from "@/lib/baby/format";

interface Props {
  events: BabyEvent[];
  /** Refetch from the server once a write settles. */
  onChanged: () => void;
}

/**
 * Everything logged today, and the only place details are ever asked for.
 *
 * The tiles above take a tap and ask nothing. This is where a tap becomes "left
 * side, 12 minutes" — afterwards, when there is a free hand, or never. A row that
 * is never opened is still a complete, useful record of when it happened.
 */
export function BabyToday({ events, onChanged }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-stone-400">
          Today
        </h3>
        <p className="text-xs text-stone-400">Nothing logged yet today.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Today
      </h3>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            expanded={expandedId === e.id}
            onToggleExpand={() =>
              setExpandedId((current) => (current === e.id ? null : e.id))
            }
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

function EventRow({
  event,
  expanded,
  onToggleExpand,
  onChanged,
}: {
  event: BabyEvent;
  expanded: boolean;
  onToggleExpand: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(event.note ?? "");
  const [saving, setSaving] = useState(false);

  const payload = (event.payload ?? {}) as Record<string, Json>;
  const chipGroups = DETAIL_CHIPS[event.event_type as BabyEventType] ?? [];
  const running = event.ended_at === null && event.event_type !== "diaper";

  const durationSeconds = event.ended_at
    ? secondsBetween(event.started_at, new Date(event.ended_at).getTime())
    : null;

  async function save(patch: { note?: string; payload?: Record<string, Json> }) {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("baby_events")
      .update({
        note: patch.note !== undefined ? patch.note || null : event.note,
        payload:
          patch.payload !== undefined
            ? { ...payload, ...patch.payload }
            : (event.payload ?? {}),
      })
      .eq("id", event.id);
    setSaving(false);

    if (error) {
      toast.error("Couldn't save that detail.");
      return;
    }
    onChanged();
  }

  async function remove() {
    await deleteWithUndo({
      table: "baby_events",
      ids: [event.id],
      message: `${EVENT_LABEL[event.event_type] ?? "Entry"} removed`,
      // The list is server-derived, so both directions are just a refetch.
      onShow: onChanged,
      onHide: onChanged,
      onSettled: onChanged,
    });
  }

  // Only the groups whose question still makes sense given what is answered.
  const visibleGroups = chipGroups.filter((g) => !g.showIf || g.showIf(payload));
  // The collapsed row shows the first answered chip, which is the headline detail.
  const summaryChip = visibleGroups
    .map((g) => payload[g.key])
    .find((v): v is string => typeof v === "string" && v.length > 0);

  return (
    <li>
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left active:bg-stone-50"
      >
        <span className="min-w-0">
          <span className="text-sm text-stone-800">
            {EVENT_LABEL[event.event_type] ?? event.event_type}
          </span>
          {summaryChip && (
            <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
              {summaryChip}
            </span>
          )}
          {event.note && (
            <span className="ml-2 truncate text-xs text-stone-400">{event.note}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-stone-400">
          {formatTimeOfDay(event.started_at)}
          {running
            ? " · running"
            : durationSeconds !== null
              ? ` · ${formatDuration(durationSeconds)}`
              : ""}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-stone-100 bg-stone-50 px-3 py-3">
          {visibleGroups.map((group) => {
            const current = payload[group.key] as string | undefined;
            return (
              <div key={group.key} className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-stone-400">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={saving}
                      data-testid={`chip-${group.key}-${option}`}
                      onClick={() =>
                        // Tapping the answer again clears it. Nothing here is
                        // required, and a wrong chip must be as cheap to undo as
                        // it was to set.
                        save({ payload: { [group.key]: current === option ? null : option } })
                      }
                      className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
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

          <div className="flex gap-2">
            <input
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              placeholder="Note"
              className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="button"
              disabled={saving || note === (event.note ?? "")}
              onClick={() => save({ note })}
              className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>

          <button
            type="button"
            onClick={remove}
            className="text-xs text-rose-600 underline underline-offset-2"
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}
