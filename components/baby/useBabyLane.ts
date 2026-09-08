"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { defaultKidId, startOfToday, type BabyEvent } from "@/lib/baby/events";

export type Kid = { id: string; name: string; birth_date: string | null };

/**
 * Timer types. Diaper and growth are point events whose `ended_at` is null
 * forever, so asking whether one is "open" would light up a timer that never
 * stops.
 */
const OPEN_TYPES = ["feed", "sleep", "pump", "contraction"];

export interface BabyLane {
  loading: boolean;
  failed: boolean;
  kids: Kid[];
  kidId: string | null;
  chooseKid: (id: string) => void;
  /** Everything from today, plus anything still running from before midnight. */
  events: BabyEvent[];
  refresh: () => Promise<void>;
}

function kidStorageKey(familyId: string) {
  return `baby.kid.${familyId}`;
}

function readStoredKid(familyId: string): string | null {
  try {
    return window.localStorage.getItem(kidStorageKey(familyId));
  } catch {
    // Private mode, or storage disabled. The youngest-kid default covers it.
    return null;
  }
}

/**
 * The reads every baby page needs, in one round trip's worth of parallel queries.
 *
 * Shared rather than duplicated per page because "what is running" has exactly
 * one correct answer and it lives in the database: `ended_at IS NULL`. A timer
 * started on /baby/feed has to still be visibly running from /baby after the app
 * has been closed and reopened, and that only works if every page asks the same
 * question of the same source instead of holding its own state.
 */
export function useBabyLane(familyId: string): BabyLane {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [kids, setKids] = useState<Kid[]>([]);
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [preferredKidId, setPreferredKidId] = useState<string | null>(null);
  const [chosenKidId, setChosenKidId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const since = startOfToday();

    const [kidsRes, todayRes, openRes] = await Promise.all([
      supabase.from("kids").select("id, name, birth_date").eq("family_id", familyId).order("name"),
      supabase
        .from("baby_events")
        .select("*")
        .eq("family_id", familyId)
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      // A sleep started at 11pm is still running at 1am and is not "today".
      // Missing it would let a second row open on top of the first.
      supabase
        .from("baby_events")
        .select("*")
        .eq("family_id", familyId)
        .in("event_type", OPEN_TYPES)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

    const nextKids = (kidsRes.data ?? []) as Kid[];

    const merged = new Map<string, BabyEvent>();
    for (const e of [...(openRes.data ?? []), ...(todayRes.data ?? [])]) {
      merged.set(e.id, e as BabyEvent);
    }

    setKids(nextKids);
    setEvents([...merged.values()].sort((a, b) => b.started_at.localeCompare(a.started_at)));

    const stored = readStoredKid(familyId);
    setPreferredKidId(
      stored && nextKids.some((k) => k.id === stored) ? stored : defaultKidId(nextKids)
    );
    setFailed(!!(kidsRes.error || todayRes.error || openRes.error));
    setLoading(false);
  }, [familyId]);

  useEffect(() => {
    let cancelled = false;
    // An async body, so nothing here sets state synchronously inside the effect.
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const kidId =
    chosenKidId && kids.some((k) => k.id === chosenKidId) ? chosenKidId : preferredKidId;

  const chooseKid = useCallback(
    (id: string) => {
      setChosenKidId(id);
      try {
        window.localStorage.setItem(kidStorageKey(familyId), id);
      } catch {
        // Not worth telling anyone about: the choice just won't be remembered.
      }
    },
    [familyId]
  );

  return { loading, failed, kids, kidId, chooseKid, events, refresh: load };
}

/** The most recent event of a type, running or finished. */
export function lastEventOf(
  events: BabyEvent[],
  type: string,
  kidId: string | null
): BabyEvent | null {
  return (
    events.find(
      (e) =>
        e.event_type === type &&
        // Contractions carry no kid_id by design, so they are never filtered out.
        (type === "contraction" || kidId === null || e.kid_id === kidId)
    ) ?? null
  );
}
