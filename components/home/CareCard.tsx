"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, HeartPulse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BP_ACTION, bpBand, daysSince } from "@/lib/care/rules";
import { nextDueLabel } from "@/lib/baby/medicine";
import { exerciseGate, targetsFor, WEEKLY_MINUTES, type Nutrients } from "@/lib/care/nutrition";

type CareBrief = {
  person: string | null;
  delivered_on: string | null;
  bp_recent: Array<{ at: string; systolic: number; diastolic: number }>;
  medicines: Array<{ name: string; next_due_at: string | null }>;
  lactating?: boolean;
  delivery_type?: string | null;
  exercise_cleared_on?: string | null;
  food_today?: { entries: number; totals: Nutrients } | null;
  food_goals?: { kcal: number | null; overrides: Nutrients | null } | null;
  move_minutes_7d?: number;
};

/**
 * Home's line for each grown-up with a care profile: day after birth, the
 * latest blood pressure (outlined when it's in an action band) and the next
 * medicine due, then protein, fiber and movement against their targets.
 * Reads the same brief Claude reads.
 */
export function CareCard({ familyId }: { familyId: string }) {
  const [care, setCare] = useState<CareBrief[] | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient().rpc("fn_family_brief", { p_family_id: familyId });
      if (cancelled || error || !data) return;
      setCare(((data as { care?: CareBrief[] }).care ?? []) as CareBrief[]);
      setNowMs(Date.now());
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  if (!care || !care.length || nowMs === null) return null;

  return (
    <>
      {care.map((c) => {
        const first = (c.person ?? "").split(" ")[0] || "Care";
        const day = daysSince(c.delivered_on, new Date(nowMs));
        const bp = c.bp_recent[0];
        const band = bp ? bpBand(bp.systolic, bp.diastolic) : null;
        const fresh = bp && nowMs - Date.parse(bp.at) < 24 * 3600_000;
        const flagged = fresh && band && band !== "under";
        const next = [...c.medicines]
          .filter((m) => m.next_due_at)
          .sort((a, b) => Date.parse(a.next_due_at!) - Date.parse(b.next_due_at!))[0];
        const due = next ? nextDueLabel(next.next_due_at, nowMs) : null;
        const targets = targetsFor(!!c.lactating, c.food_goals ?? {});
        const totals = c.food_today?.totals ?? {};
        const gated = exerciseGate(c).gated;
        const food = [
          totals.protein_g !== undefined || targets.protein_g ? `Protein ${Math.round(totals.protein_g ?? 0)}${targets.protein_g ? `/${targets.protein_g.value}` : ""} g` : null,
          totals.fiber_g !== undefined || targets.fiber_g ? `Fiber ${Math.round(totals.fiber_g ?? 0)}${targets.fiber_g ? `/${targets.fiber_g.value}` : ""} g` : null,
          `Moved ${Math.round(c.move_minutes_7d ?? 0)}${gated ? "" : `/${WEEKLY_MINUTES}`} min/wk`,
        ].filter(Boolean);
        return (
          <Link
            key={first}
            href="/care"
            data-testid="home-care"
            className={`block rounded-2xl bg-white p-3 ring-1 ${flagged ? "ring-2 ring-amber-600" : "ring-stone-200"}`}
          >
            <span className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-amber-600">
                <HeartPulse className="h-4 w-4" aria-hidden /> {first}
              </span>
              {day !== null && <span className="text-xs text-stone-500">day {day} after birth</span>}
            </span>
            <span className="grid grid-cols-2 gap-2">
              <span className="rounded-xl bg-stone-100 px-2.5 py-2">
                <span className="block text-[11px] text-stone-500">Last BP</span>
                <span className="block text-lg tabular-nums text-stone-800">{bp ? `${bp.systolic}/${bp.diastolic}` : "—"}</span>
                {flagged && band && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> {BP_ACTION[band].label}
                  </span>
                )}
              </span>
              <span className="rounded-xl bg-stone-100 px-2.5 py-2">
                <span className="block text-[11px] text-stone-500">Next medicine</span>
                <span className="block truncate text-sm text-stone-800">{next ? next.name : "—"}</span>
                {due && <span className={`block text-[11px] ${due.overdue ? "font-medium text-amber-700" : "text-stone-500"}`}>{due.text}</span>}
              </span>
            </span>
            <span className="mt-2 block truncate text-xs text-stone-600" data-testid="home-care-food">
              {food.join(" · ")}
            </span>
          </Link>
        );
      })}
    </>
  );
}
