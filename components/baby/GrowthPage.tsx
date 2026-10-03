"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BabyPageShell } from "./BabyPageShell";
import { EventHistory, laneKey } from "./EventHistory";
import { useBabyLane } from "./useBabyLane";
import { useStartTime } from "./useStartTime";
import { logPoint } from "@/lib/baby/write";
import { growthPayload } from "@/lib/baby/growth";
import type { Json } from "@/lib/supabase/database.types";

/**
 * /baby/growth — weight (lb + oz), length and head (in). All optional, at least
 * one required. Stored as entered, with metric alongside (lib/baby/growth.ts).
 *
 * Nine rows in three years of export, so this is a page that exists to be
 * correct rather than fast: it is opened after an appointment, with the numbers
 * already written on a card, and the start-time control matters more here than
 * anywhere else because the weigh-in was hours ago.
 */

export function GrowthPage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const start = useStartTime();
  const [lb, setLb] = useState("");
  const [oz, setOz] = useState("");
  const [height, setHeight] = useState("");
  const [head, setHead] = useState("");
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
    const built = growthPayload({ lb, oz, height, head });
    if ("error" in built) {
      toast.error(built.error);
      return;
    }
    const payload = built.payload as Record<string, Json>;

    setSaving(true);
    const result = await logPoint({
      familyId,
      type: "growth",
      kidId: lane.kidId,
      payload,
      at: start.instant(),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setLb("");
    setOz("");
    setHeight("");
    setHead("");
    await lane.refresh();
    start.reset();
    toast.success("Measurement saved");
  }

  return (
    <BabyPageShell
      title="Growth"
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={start.value}
      onStartAt={start.set}
      reminderLabel="Weigh-in"
      blockedReason={blocked}
    >
      <div className="space-y-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
            Weight
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <MeasureInput value={lb} onChange={setLb} testId="growth-weight_lb" width="w-20" />
            <span className="text-lg text-stone-400">lb</span>
            <MeasureInput value={oz} onChange={setOz} testId="growth-weight_oz" width="w-20" />
            <span className="text-lg text-stone-400">oz</span>
          </div>
        </div>
        {(
          [
            { label: "Length", value: height, set: setHeight, testId: "growth-height_in" },
            { label: "Head", value: head, set: setHead, testId: "growth-head_in" },
          ] as const
        ).map((f) => (
          <div key={f.label} className="rounded-2xl border border-stone-200 bg-white p-4">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
              {f.label}
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <MeasureInput value={f.value} onChange={f.set} testId={f.testId} width="w-28" />
              <span className="text-lg text-stone-400">in</span>
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
      <EventHistory
        familyId={familyId}
        kidId={lane.kidId}
        type="growth"
        refreshKey={laneKey(lane.events)}
        onChanged={lane.refresh}
      />
    </BabyPageShell>
  );
}

function MeasureInput({
  value,
  onChange,
  testId,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  width: string;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
      placeholder="—"
      className={`${width} bg-transparent text-4xl tabular-nums text-stone-900 placeholder-stone-200 focus:outline-none`}
    />
  );
}
