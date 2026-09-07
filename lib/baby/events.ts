import type { Database } from "@/lib/supabase/database.types";

export type BabyEvent = Database["public"]["Tables"]["baby_events"]["Row"];
export type ContractionRow = Database["public"]["Views"]["v_contractions_recent"]["Row"];
export type ShareLink = Database["public"]["Tables"]["baby_share_links"]["Row"];

export type BabyEventType = "feed" | "diaper" | "sleep" | "pump";

/**
 * Which tiles hold a stopwatch and which are done the instant you tap them.
 *
 * `fn_baby_toggle` finds the open row of a type and closes it, so pointing it at
 * a point event would "stop" a diaper logged an hour ago. `fn_baby_log` never
 * sets ended_at, so a diaper's row stays open forever by design — which is also
 * why `v_baby_today.total_minutes` and `in_progress` are meaningless for diaper
 * and are not read for it anywhere in this UI.
 */
export const TILE_MODE: Record<BabyEventType, "timer" | "point"> = {
  feed: "timer",
  sleep: "timer",
  pump: "timer",
  diaper: "point",
};

export const TILES: Array<{ type: BabyEventType; label: string; emoji: string }> = [
  { type: "feed", label: "Feed", emoji: "🍼" },
  { type: "diaper", label: "Diaper", emoji: "🧷" },
  { type: "sleep", label: "Sleep", emoji: "😴" },
  { type: "pump", label: "Pump", emoji: "🫙" },
];

export interface ChipGroup {
  key: string;
  label: string;
  options: string[];
  /**
   * Whether this group is worth showing at all, given what has been answered so
   * far. Poo consistency is meaningless on a wet-only change, and offering it
   * anyway is how a one-tap log turns back into a form.
   */
  showIf?: (payload: Record<string, unknown>) => boolean;
}

const contentsIncludes = (...wanted: string[]) => (payload: Record<string, unknown>) =>
  wanted.includes(String(payload.contents ?? ""));

/**
 * Detail chips offered *after* an event is logged. Never before — the whole point
 * of a one-touch tile is that a tap costs nothing to make and nothing to correct.
 *
 * The shapes come from three years of the family's own export rather than from
 * what a tracker could theoretically record:
 *
 *   diaper   contents + amount + consistency. Consistency was filled 20.9% of the
 *            time — used when notable, which is exactly right, so it is offered
 *            and never required.
 *   sleep    one location chip. Start location was filled 6 times in 1,800 sleeps;
 *            start condition 0; end condition 0. Building those two pickers would
 *            be copying dead UI, so they are not here.
 *   feed     method only. Which side, and for how long, is the nursing screen's
 *            job now, and a chip cannot express two ordered segments.
 */
export const DETAIL_CHIPS: Record<BabyEventType, ChipGroup[]> = {
  feed: [{ key: "method", label: "Method", options: ["breast", "bottle", "solid"] }],
  diaper: [
    { key: "contents", label: "Contents", options: ["pee", "poo", "both", "dry"] },
    {
      key: "pee_amount",
      label: "Pee",
      options: ["small", "medium", "large"],
      showIf: contentsIncludes("pee", "both"),
    },
    {
      key: "poo_amount",
      label: "Poo",
      options: ["small", "medium", "large"],
      showIf: contentsIncludes("poo", "both"),
    },
    {
      key: "consistency",
      label: "Consistency",
      options: ["loose", "solid", "runny"],
      showIf: contentsIncludes("poo", "both"),
    },
  ],
  pump: [{ key: "side", label: "Side", options: ["left", "right", "both"] }],
  sleep: [{ key: "location", label: "Where", options: ["crib", "bassinet", "arms", "stroller", "car"] }],
};

export const EVENT_LABEL: Record<string, string> = {
  feed: "Feed",
  diaper: "Diaper",
  sleep: "Sleep",
  pump: "Pump",
  contraction: "Contraction",
  growth: "Growth",
  medicine: "Medicine",
  note: "Note",
};

/** Local midnight, as an ISO string PostgREST will accept. */
export function startOfToday(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * The one row that counts as "running" for a tile.
 *
 * Only timer types can be running. A point event's ended_at is null forever, so
 * asking this about a diaper would light up a timer that never stops.
 */
export function openEventFor(
  events: BabyEvent[],
  type: BabyEventType,
  kidId: string | null
): BabyEvent | null {
  if (TILE_MODE[type] !== "timer") return null;
  return (
    events.find(
      (e) =>
        e.event_type === type &&
        e.ended_at === null &&
        (kidId === null || e.kid_id === kidId)
    ) ?? null
  );
}

/**
 * Pick the baby out of a family's kids: youngest known birth date wins, and a kid
 * with no birth date sorts last rather than first. Only ever a default — the
 * sheet lets you change it, and nothing here creates a row.
 */
export function defaultKidId(
  kids: Array<{ id: string; birth_date: string | null }>
): string | null {
  if (kids.length === 0) return null;
  const sorted = [...kids].sort((a, b) => {
    if (a.birth_date && b.birth_date) return b.birth_date.localeCompare(a.birth_date);
    if (a.birth_date) return -1;
    if (b.birth_date) return 1;
    return 0;
  });
  return sorted[0].id;
}
