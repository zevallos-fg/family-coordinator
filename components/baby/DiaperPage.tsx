"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BabyPageShell } from "./BabyPageShell";
import { useBabyLane } from "./useBabyLane";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";
import { logPoint } from "@/lib/baby/write";
import { DETAIL_CHIPS } from "@/lib/baby/events";
import type { Json } from "@/lib/supabase/database.types";

type Mode = "diaper" | "potty";

/** Contents, as four circles. The whole body of the page, and one tap logs. */
const CONTENTS = [
  { key: "pee", label: "Pee", emoji: "💧" },
  { key: "poo", label: "Poo", emoji: "💩" },
  { key: "both", label: "Mixed", emoji: "🌀" },
  { key: "dry", label: "Dry", emoji: "✨" },
] as const;

/**
 * /baby/diaper — one tap logs, and nothing is asked before that tap.
 *
 * Amount and consistency appear only afterwards, on the row that was just
 * written, and poo amount only when the contents say there was poo. Asking first
 * turns a one-tap log back into a form, which is the thing this screen exists
 * not to be. Consistency was filled 20.9% of the time in the export — used when
 * notable, which is exactly right, so it is offered and never required.
 */
export function DiaperPage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [mode, setMode] = useState<Mode>("diaper");
  const [startAt, setStartAt] = useState(() => toLocalInputValue());
  const [pending, setPending] = useState<string | null>(null);
  /** The row just written, which is the only thing the chips below can edit. */
  const [justLogged, setJustLogged] = useState<{ id: string; payload: Record<string, Json> } | null>(
    null
  );

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

  async function log(contents: string) {
    if (blocked || !lane.kidId) return;
    setPending(contents);
    const payload: Record<string, Json> = { contents, ...(mode === "potty" ? { potty: true } : {}) };
    const result = await logPoint({
      familyId,
      type: "diaper",
      kidId: lane.kidId,
      payload,
      at: fromLocalInputValue(startAt),
    });
    setPending(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (result.id) setJustLogged({ id: result.id, payload });
    await lane.refresh();
    setStartAt(toLocalInputValue());
  }

  async function setDetail(key: string, value: string | null) {
    if (!justLogged) return;
    const next = { ...justLogged.payload, [key]: value };
    setJustLogged({ ...justLogged, payload: next });
    const supabase = createClient();
    const { error } = await supabase
      .from("baby_events")
      .update({ payload: next as never })
      .eq("id", justLogged.id);
    if (error) toast.error("Couldn't save that detail.");
    else await lane.refresh();
  }

  const groups = DETAIL_CHIPS.diaper.filter(
    (g) => g.key !== "contents" && (!g.showIf || g.showIf(justLogged?.payload ?? {}))
  );

  return (
    <BabyPageShell
      title="Diaper"
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={startAt}
      onStartAt={setStartAt}
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
            disabled={pending !== null || !!blocked || !lane.kidId}
            onClick={() => log(c.key)}
            className={`flex aspect-square flex-col items-center justify-center rounded-full border-4 disabled:opacity-50 ${
              justLogged?.payload.contents === c.key
                ? "border-stone-800 bg-stone-50"
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

      {/* Only after. Never before. */}
      {justLogged && groups.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">Logged. Add detail, or don&apos;t — it&apos;s done either way.</p>
          {groups.map((group) => {
            const current = justLogged.payload[group.key] as string | undefined;
            return (
              <div key={group.key} className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-stone-400">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-testid={`chip-${group.key}-${option}`}
                      onClick={() => setDetail(group.key, current === option ? null : option)}
                      className={`rounded-full px-4 py-2 text-sm ${
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
        </section>
      )}
    </BabyPageShell>
  );
}
