"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RecentRow } from "./RecentList";
import { daySummary, groupByDay } from "@/lib/baby/history";
import type { BabyEvent } from "@/lib/baby/events";

const PAGE = 100;

/**
 * Every entry of one type for one child, a day at a time, newest first.
 *
 * Replaces Recent, which showed only the last 24 hours and ten rows — on a
 * night with a dozen feeds the earlier ones fell off the screen. Rows are the
 * same editable rows as before.
 *
 * Reads its own data rather than the lane's, because the lane is deliberately
 * a 24-hour window. `refreshKey` changes whenever the lane sees a write, so a
 * feed logged or stopped on this page shows up here without a reload; edits
 * made inside the list reload it directly.
 */
export function EventHistory({
  familyId,
  kidId,
  type,
  refreshKey,
  onChanged,
}: {
  familyId: string;
  kidId: string | null;
  type: string;
  refreshKey: string;
  onChanged: () => void | Promise<void>;
}) {
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!kidId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("baby_events")
      .select("*")
      .eq("family_id", familyId)
      .eq("kid_id", kidId)
      .eq("event_type", type)
      .order("started_at", { ascending: false })
      // One extra row tells us whether an older page exists.
      .limit(limit + 1);
    // A failed read must not look like an empty history.
    setFailed(!!error);
    if (error) return;
    const rows = (data ?? []) as BabyEvent[];
    setMore(rows.length > limit);
    setEvents(rows.slice(0, limit));
  }, [familyId, kidId, type, limit]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load, refreshKey]);

  const changed = useCallback(() => {
    void load();
    void onChanged();
  }, [load, onChanged]);

  const days = groupByDay(events);

  return (
    <section className="space-y-4" data-testid="event-history">
      <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">History</h2>

      {failed && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Couldn&apos;t load the history. Check your connection and reload.
        </p>
      )}

      {!failed && days.length === 0 && <p className="text-xs text-stone-400">No entries yet.</p>}

      {days.map((day) => (
        <div key={day.key} className="space-y-1.5" data-testid={`history-day-${day.key}`}>
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h3 className="text-sm font-medium text-stone-700">{day.label}</h3>
            <span className="text-[11px] text-stone-500" data-testid={`history-summary-${day.key}`}>
              {daySummary(type, day.events)}
            </span>
          </div>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {day.events.map((e) => (
              <RecentRow
                key={`${e.id}:${e.started_at}:${e.ended_at ?? ""}`}
                event={e}
                open={openId === e.id}
                onToggle={() => setOpenId((c) => (c === e.id ? null : e.id))}
                onChanged={changed}
              />
            ))}
          </ul>
        </div>
      ))}

      {more && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          data-testid="history-more"
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-500 active:bg-stone-50"
        >
          Show older
        </button>
      )}
    </section>
  );
}

/** Changes whenever the lane's rows do, so the history refetches after a write. */
export function laneKey(events: BabyEvent[]): string {
  return events.map((e) => `${e.id}:${e.started_at}:${e.ended_at ?? ""}:${JSON.stringify(e.payload)}`).join("|");
}
