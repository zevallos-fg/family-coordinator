"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/ui/Sheet";
import { BabyTiles } from "./BabyTiles";
import { BabyToday } from "./BabyToday";
import { ContractionTimer } from "./ContractionTimer";
import { NursingTimers } from "./NursingTimers";
import { ShareLinks } from "./ShareLinks";
import {
  TILE_MODE,
  defaultKidId,
  startOfToday,
  type BabyEvent,
  type BabyEventType,
  type ContractionRow,
  type ShareLink,
} from "@/lib/baby/events";

interface Props {
  familyId: string;
  open: boolean;
  onClose: () => void;
}

type Kid = { id: string; name: string; birth_date: string | null };

type BabyData = {
  failed: boolean;
  kids: Kid[];
  /** Last choice if it still exists, otherwise the youngest kid. Never a new row. */
  preferredKidId: string | null;
  events: BabyEvent[];
  contractions: ContractionRow[];
  links: ShareLink[];
};

/** The two scopes this sheet owns. caregiver_shift links live in the same table. */
const BABY_SCOPES = ["contractions", "baby_today"];

/** Timer types only. Diaper's ended_at is null forever, so it is never "open". */
const OPEN_TYPES = ["feed", "sleep", "pump", "contraction"];

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
 * Every read the sheet needs, in one round trip's worth of parallel queries.
 *
 * Deliberately outside the component: it touches no React state, so the effect
 * that calls it stays a subscription rather than a cascade of renders.
 */
async function loadBabyData(familyId: string): Promise<BabyData> {
  const supabase = createClient();
  const since = startOfToday();

  const [kidsRes, todayRes, openRes, contractionsRes, linksRes] = await Promise.all([
    supabase
      .from("kids")
      .select("id, name, birth_date")
      .eq("family_id", familyId)
      .order("name"),
    supabase
      .from("baby_events")
      .select("*")
      .eq("family_id", familyId)
      .gte("started_at", since)
      .order("started_at", { ascending: false }),
    // A sleep started at 11pm is still running at 1am, and a contraction older
    // than the view's 12-hour window is still running too. Neither is caught by
    // "today", and missing one would let a second row open on top of it.
    supabase
      .from("baby_events")
      .select("*")
      .eq("family_id", familyId)
      .in("event_type", OPEN_TYPES)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("v_contractions_recent")
      .select("*")
      .eq("family_id", familyId)
      .order("started_at", { ascending: false }),
    supabase
      .from("baby_share_links")
      .select("*")
      .eq("family_id", familyId)
      // The table is shared with caregiver-shift links now. Without this filter
      // the baby sheet listed those too — under a raw "caregiver_shift" label,
      // with a Revoke button that would kill a nanny's link from the baby lane.
      .in("scope", BABY_SCOPES)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const kids = (kidsRes.data ?? []) as Kid[];

  const merged = new Map<string, BabyEvent>();
  for (const e of [...(openRes.data ?? []), ...(todayRes.data ?? [])]) {
    merged.set(e.id, e as BabyEvent);
  }
  const events = [...merged.values()].sort((a, b) =>
    b.started_at.localeCompare(a.started_at)
  );

  // Same guard for the contraction list: if one is running but has aged out of
  // v_contractions_recent, show it rather than offer to start another.
  const viewRows = (contractionsRes.data ?? []) as ContractionRow[];
  const runningContraction = events.find(
    (e) => e.event_type === "contraction" && e.ended_at === null
  );
  const contractions =
    !runningContraction || viewRows.some((r) => r.id === runningContraction.id)
      ? viewRows
      : [
          {
            family_id: familyId,
            id: runningContraction.id,
            started_at: runningContraction.started_at,
            ended_at: null,
            duration_s: null,
            since_prev_s: null,
            in_progress: true,
          },
          ...viewRows,
        ];

  const stored = readStoredKid(familyId);

  return {
    failed: !!(kidsRes.error || todayRes.error || openRes.error || contractionsRes.error),
    kids,
    preferredKidId:
      stored && kids.some((k) => k.id === stored) ? stored : defaultKidId(kids),
    events,
    contractions,
    links: (linksRes.data ?? []) as ShareLink[],
  };
}

export function BabySheet({ familyId, open, onClose }: Props) {
  const [data, setData] = useState<BabyData | null>(null);
  const [chosenKidId, setChosenKidId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await loadBabyData(familyId));
  }, [familyId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadBabyData(familyId).then((next) => {
      if (!cancelled) setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, familyId]);

  const kids = data?.kids ?? [];
  const kidId =
    chosenKidId && kids.some((k) => k.id === chosenKidId)
      ? chosenKidId
      : (data?.preferredKidId ?? null);

  function chooseKid(id: string) {
    setChosenKidId(id);
    try {
      window.localStorage.setItem(kidStorageKey(familyId), id);
    } catch {
      // Not worth telling anyone about: the choice just won't be remembered.
    }
  }

  async function tapTile(type: BabyEventType) {
    if (!kidId) return;
    setPending(type);
    const supabase = createClient();

    const { error } =
      TILE_MODE[type] === "timer"
        ? await supabase.rpc("fn_baby_toggle", {
            p_family_id: familyId,
            p_event_type: type,
            p_kid_id: kidId,
          })
        : await supabase.rpc("fn_baby_log", {
            p_family_id: familyId,
            p_event_type: type,
            p_kid_id: kidId,
          });

    if (error) {
      toast.error("That didn't save. Tap again?");
      setPending(null);
      return;
    }
    await refresh();
    setPending(null);
  }

  async function toggleContraction() {
    setPending("contraction");
    const supabase = createClient();
    // No kid id, deliberately: baby_events allows a null kid_id only for this
    // event type, which is what lets the timer work before the baby exists.
    const { error } = await supabase.rpc("fn_baby_toggle", {
      p_family_id: familyId,
      p_event_type: "contraction",
    });

    if (error) {
      toast.error("That didn't save. Tap again?");
      setPending(null);
      return;
    }
    await refresh();
    setPending(null);
  }

  const blockedReason =
    data && kids.length === 0 ? (
      <>
        No child record yet, so feeds, diapers, sleep and pumping have nowhere to
        go. The contraction timer below works without one.{" "}
        <Link href="/caregiver/kids/new" className="underline underline-offset-2">
          Add the baby
        </Link>
        .
      </>
    ) : null;

  const visibleToday = (data?.events ?? []).filter(
    (e) => e.event_type === "contraction" || kidId === null || e.kid_id === kidId
  );

  return (
    <Sheet open={open} onClose={onClose} title="Baby">
      {!data ? (
        <p className="py-8 text-center text-sm text-stone-400">Loading…</p>
      ) : data.failed ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Couldn&apos;t load the baby log. Check your connection and reopen this
          sheet.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Shown even for a single kid. The family already has an older child,
              so a tile that silently defaulted to whoever happens to be first
              would file the newborn's feeds under their sibling. Say who. */}
          {kids.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-400">Logging for</span>
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => chooseKid(k.id)}
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

          <BabyTiles
            events={data.events}
            kidId={kidId}
            blockedReason={blockedReason}
            pendingType={pending as BabyEventType | null}
            onTap={tapTile}
          />

          <NursingTimers
            events={data.events}
            kidId={kidId}
            familyId={familyId}
            blockedReason={blockedReason}
            onChanged={refresh}
          />

          <ContractionTimer
            rows={data.contractions}
            pending={pending === "contraction"}
            onToggle={toggleContraction}
          />

          <BabyToday events={visibleToday} onChanged={refresh} />

          <ShareLinks familyId={familyId} links={data.links} onChanged={refresh} />
        </div>
      )}
    </Sheet>
  );
}
