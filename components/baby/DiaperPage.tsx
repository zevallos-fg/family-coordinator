"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BabyPageShell } from "./BabyPageShell";
import { EventHistory, laneKey } from "./EventHistory";
import { useBabyLane } from "./useBabyLane";
import { useStartTime } from "./useStartTime";
import { Segmented } from "./Segmented";
import { logPoint } from "@/lib/baby/write";
import { visibleChipGroups } from "@/lib/baby/events";
import { diaperPayload } from "@/lib/baby/diaper";
import type { Json } from "@/lib/supabase/database.types";

type Mode = "diaper" | "potty";

/** Contents, as four large circles. Tapping one selects it; Save logs it. */
const CONTENTS = [
  { key: "pee", label: "Pee", emoji: "💧" },
  { key: "poo", label: "Poo", emoji: "💩" },
  { key: "both", label: "Mixed", emoji: "🌀" },
  { key: "dry", label: "Dry", emoji: "✨" },
] as const;

/**
 * /baby/diaper — pick what was in it, add detail if you want, Save.
 *
 * This used to log on the first tap and offer detail as small chips on the row
 * afterwards. In use that read as "the buttons are tiny and I can't tell what
 * got saved". It now works the way Huckleberry does, which is the flow this
 * family already knows: the contents circle selects, the details sit right
 * under it as full-width controls (size, consistency, rash, note), and one big
 * Save writes the whole thing. Two taps for a plain change, nothing hidden.
 *
 * The details stay optional and appear only when they apply — poo size and
 * consistency only when there was poo — and every one can be corrected later
 * from History.
 */
export function DiaperPage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [mode, setMode] = useState<Mode>("diaper");
  const start = useStartTime();
  const [saving, setSaving] = useState(false);
  const [contents, setContents] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState("");

  const blocked =
    !lane.loading && lane.kids.length === 0 ? (
      <>
        No child record yet, so diapers have nowhere to go.{" "}
        <Link href="/caregiver/kids/new" className="underline underline-offset-2">
          Add the baby
        </Link>
        .
      </>
    ) : null;

  function choose(next: string) {
    setContents((c) => (c === next ? null : next));
  }

  async function save() {
    if (blocked || !lane.kidId || !contents) return;
    const payload = diaperPayload(contents, details, mode === "potty") as Record<string, Json>;
    setSaving(true);
    const result = await logPoint({
      familyId,
      type: "diaper",
      kidId: lane.kidId,
      payload,
      at: start.instant(),
      note: note.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Diaper logged");
    setContents(null);
    setDetails({});
    setNote("");
    start.reset();
    await lane.refresh();
  }

  const groups = contents
    ? visibleChipGroups("diaper", { contents }).filter((g) => g.key !== "contents")
    : [];

  return (
    <BabyPageShell
      title="Diaper"
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={start.value}
      onStartAt={start.set}
      reminderLabel="Diaper"
      blockedReason={blocked}
      segmented={
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
          {(["diaper", "potty"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`diaper-mode-${m}`}
              onClick={() => setMode(m)}
              className={`rounded-lg py-2 text-sm capitalize ${
                mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {CONTENTS.map((c) => (
          <button
            key={c.key}
            type="button"
            data-testid={`diaper-${c.key}`}
            aria-pressed={contents === c.key}
            disabled={saving || !!blocked || !lane.kidId}
            onClick={() => choose(c.key)}
            className={`flex aspect-square flex-col items-center justify-center rounded-full border-4 transition-colors disabled:opacity-50 ${
              contents === c.key
                ? "border-amber-500 bg-amber-100"
                : "border-stone-200 bg-white active:bg-stone-50"
            }`}
          >
            <span aria-hidden className="text-4xl">
              {c.emoji}
            </span>
            <span className="mt-2 text-base font-semibold text-stone-800">{c.label}</span>
          </button>
        ))}
      </div>

      {contents && (
        <section
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4"
          data-testid="diaper-details"
        >
          <p className="text-sm font-medium text-stone-700">Optional details</p>
          {groups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-stone-400">{group.label}</p>
              <Segmented
                options={group.options}
                labels={group.optionLabels}
                value={details[group.key]}
                disabled={saving}
                testIdPrefix={`chip-${group.key}`}
                onChange={(next) => setDetails((d) => ({ ...d, [group.key]: next }))}
              />
            </div>
          ))}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note"
            data-testid="diaper-note"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </section>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!contents || saving || !!blocked || !lane.kidId}
        data-testid="diaper-save"
        className="w-full rounded-2xl bg-stone-800 px-4 py-4 text-base font-medium text-white disabled:opacity-40"
      >
        {contents ? "Save" : "Pick pee, poo, mixed or dry"}
      </button>

      <EventHistory
        familyId={familyId}
        kidId={lane.kidId}
        type="diaper"
        refreshKey={laneKey(lane.events)}
        onChanged={lane.refresh}
      />
    </BabyPageShell>
  );
}
