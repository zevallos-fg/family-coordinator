"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BabyPageShell } from "./BabyPageShell";
import { RecentList } from "./RecentList";
import { useBabyLane } from "./useBabyLane";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import { logPoint } from "@/lib/baby/write";
import type { Json } from "@/lib/supabase/database.types";

/**
 * /baby/growth — three numbers, all optional, at least one required.
 *
 * Nine rows in three years of export, so this is a page that exists to be
 * correct rather than fast: it is opened after an appointment, with the numbers
 * already written on a card, and the start-time control matters more here than
 * anywhere else because the weigh-in was hours ago.
 */
const FIELDS = [
  { key: "weight_kg", label: "Weight", unit: "kg", step: "0.01" },
  { key: "height_cm", label: "Height", unit: "cm", step: "0.1" },
  { key: "head_cm", label: "Head", unit: "cm", step: "0.1" },
] as const;

export function GrowthPage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [startAt, setStartAt] = useState(() => toLocalInputValue());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const blocked =
    !lane.loading && lane.kids.length === 0 ? (
      <>
        No child record yet, so measurements have nowhere to go.{" "}
        <Link href="/caregiver/kids/new" className="underline underline-offset-2">
          Add the baby
        </Link>
        .
      </>
    ) : null;

  async function save() {
    const payload: Record<string, Json> = {};
    for (const f of FIELDS) {
      const raw = values[f.key];
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error(`${f.label} doesn't look right.`);
        return;
      }
      payload[f.key] = n;
    }
    if (Object.keys(payload).length === 0) {
      toast.error("Enter at least one measurement.");
      return;
    }

    setSaving(true);
    const result = await logPoint({
      familyId,
      type: "growth",
      kidId: lane.kidId,
      payload,
      at: fromLocalInputValue(startAt),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setValues({});
    await lane.refresh();
    setStartAt(toLocalInputValue());
    toast.success("Measurement saved");
  }

  return (
    <BabyPageShell
      title="Growth"
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={startAt}
      onStartAt={setStartAt}
      reminderLabel="Weigh-in"
      blockedReason={blocked}
    >
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="rounded-2xl border border-stone-200 bg-white p-4">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
              {f.label}
            </label>
            <div className="mt-1 flex items-baseline gap-2">
              <input
                inputMode="decimal"
                step={f.step}
                value={values[f.key] ?? ""}
                data-testid={`growth-${f.key}`}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))
                }
                placeholder="—"
                className="w-32 bg-transparent text-4xl tabular-nums text-stone-900 placeholder-stone-200 focus:outline-none"
              />
              <span className="text-lg text-stone-400">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || !!blocked || !lane.kidId}
        data-testid="growth-save"
        className="w-full rounded-2xl bg-stone-800 px-4 py-4 text-base font-medium text-white disabled:opacity-50"
      >
        Save measurement
      </button>
      <RecentList events={lane.events} type="growth" onChanged={lane.refresh} />
    </BabyPageShell>
  );
}
