"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BP_ACTION, bpBand } from "@/lib/care/rules";
import { readingsOf, type Reading } from "@/components/care/BpSection";
import type { CareLog, CareMed } from "@/components/care/useCare";

/**
 * A grown-up's numbers for a doctor's visit: the last two weeks of blood
 * pressure readings and the medicines being taken, read from the care log.
 */
export function CareNumbers({ personId, name }: { personId: string; name: string }) {
  const [data, setData] = useState<{ readings: Reading[]; meds: CareMed[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [logs, meds] = await Promise.all([
        supabase.from("care_logs").select("*").eq("person_user_id", personId).eq("kind", "bp").gte("at", since).order("at", { ascending: false }),
        supabase.from("v_care_medication_status").select("*").eq("person_user_id", personId).eq("active", true),
      ]);
      if (cancelled) return;
      setFailed(!!(logs.error || meds.error));
      setData({ readings: readingsOf((logs.data ?? []) as CareLog[]), meds: (meds.data ?? []) as CareMed[] });
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  if (failed) return <p className="text-xs text-rose-700">Couldn&apos;t load {name}&apos;s numbers.</p>;
  if (!data) return null;
  return (
    <section className="space-y-1.5" data-testid="care-numbers">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">{name}&apos;s numbers to show</h2>
      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-sm">
        {data.readings.length === 0 ? (
          <p className="text-xs text-stone-500">No blood pressure readings in the last two weeks.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] text-stone-500">
                <th className="font-normal">When</th>
                <th className="font-normal">BP</th>
                <th className="font-normal">Pulse</th>
                <th className="font-normal" />
              </tr>
            </thead>
            <tbody>
              {data.readings.map((r) => {
                const band = bpBand(r.systolic, r.diastolic);
                return (
                  <tr key={r.id} className="text-stone-800">
                    <td className="py-0.5 text-stone-600">
                      {new Date(r.at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="tabular-nums">
                      {r.systolic}/{r.diastolic}
                    </td>
                    <td className="tabular-nums">{r.pulse ?? "—"}</td>
                    <td className={band === "under" ? "text-stone-500" : "font-medium text-amber-700"}>{band === "under" ? "" : BP_ACTION[band].label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data.meds.length > 0 && (
          <p className="text-xs text-stone-600">
            Medicines: {data.meds.map((m) => [m.name, m.dose, m.interval_hours ? `every ${m.interval_hours}h` : null].filter(Boolean).join(" ")).join("; ")}
          </p>
        )}
        <p className="text-[11px] text-stone-400">From the care log. Numbers only — ask the doctor what they mean.</p>
      </div>
    </section>
  );
}
