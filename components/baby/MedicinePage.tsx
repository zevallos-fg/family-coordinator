"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BabyPageShell } from "./BabyPageShell";
import { EventHistory, laneKey } from "./EventHistory";
import { useBabyLane } from "./useBabyLane";
import { useStartTime } from "./useStartTime";
import { logPoint } from "@/lib/baby/write";
import { formatAgo, formatTimeOfDay } from "@/lib/baby/format";
import { medicinePayload, nextDueLabel, parseInterval } from "@/lib/baby/medicine";
import type { Database } from "@/lib/supabase/database.types";

type Status = Database["public"]["Views"]["v_medication_status"]["Row"];

/**
 * /baby/medicine — what each child is taking, when it was last given, when the
 * next dose is due, and one big button to record a dose.
 *
 * The dose is whatever the label or the pediatrician says, typed by a parent.
 * Nothing on this screen calculates, suggests or checks a dose — it records
 * what was given and when, and works out the next time from the interval the
 * parent entered. "Next due" is also what sends the phone notification.
 */
export function MedicinePage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const start = useStartTime();
  const [meds, setMeds] = useState<Status[]>([]);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!lane.kidId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("v_medication_status")
      .select("*")
      .eq("kid_id", lane.kidId)
      .eq("active", true)
      .order("created_at", { ascending: true });
    setFailed(!!error);
    if (!error) setMeds((data ?? []) as Status[]);
    setNowMs(Date.now());
  }, [lane.kidId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load, lane.events]);

  async function give(med: Status) {
    if (!lane.kidId || !med.id) return;
    setPending(med.id);
    const result = await logPoint({
      familyId,
      type: "medicine",
      kidId: lane.kidId,
      payload: medicinePayload(med),
      at: start.instant(),
    });
    setPending(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${med.name} recorded`);
    start.reset();
    await lane.refresh();
    await load();
  }

  async function stop(med: Status) {
    if (!med.id) return;
    const supabase = createClient();
    const { error } = await supabase.from("medications").update({ active: false }).eq("id", med.id);
    if (error) {
      toast.error("Couldn't stop that. Try again?");
      return;
    }
    toast.success(`${med.name} stopped`);
    await load();
  }

  const blocked =
    !lane.loading && lane.kids.length === 0 ? (
      <>
        No child record yet.{" "}
        <Link href="/caregiver/kids/new" className="underline underline-offset-2">
          Add the baby
        </Link>
        .
      </>
    ) : null;

  return (
    <BabyPageShell
      title="Medicine"
      familyId={familyId}
      kids={lane.kids}
      kidId={lane.kidId}
      onChooseKid={lane.chooseKid}
      startAt={start.value}
      onStartAt={start.set}
      reminderLabel="Medicine"
      blockedReason={blocked}
    >
      {failed && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Couldn&apos;t load medicines. Check your connection and reload.
        </p>
      )}

      {meds.length === 0 && !failed && (
        <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
          Nothing tracked yet. Add a medicine or supplement below.
        </p>
      )}

      <ul className="space-y-3">
        {meds.map((m) => {
          const due = nextDueLabel(m.next_due_at, nowMs);
          return (
            <li key={m.id} className="rounded-2xl border border-stone-200 bg-white p-4" data-testid={`med-${m.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-stone-800">{m.name}</p>
                  <p className="text-sm text-stone-500">
                    {[m.dose, m.interval_hours ? `every ${m.interval_hours}h` : "as needed"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {m.last_dose_at
                      ? `Last: ${formatTimeOfDay(m.last_dose_at)} (${formatAgo(m.last_dose_at, nowMs)})`
                      : "Not given yet"}
                    {due && (
                      <span className={due.overdue ? "ml-2 font-medium text-rose-700" : "ml-2"}>
                        · {due.text}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void stop(m)}
                  className="shrink-0 text-xs text-stone-400 underline underline-offset-2"
                >
                  Stop
                </button>
              </div>
              <button
                type="button"
                onClick={() => void give(m)}
                disabled={pending !== null || !lane.kidId}
                data-testid={`med-give-${m.id}`}
                className="mt-3 w-full rounded-xl bg-stone-800 px-4 py-3.5 text-base font-medium text-white disabled:opacity-50"
              >
                {pending === m.id ? "Saving…" : "Given"}
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <AddMedication
          familyId={familyId}
          kidId={lane.kidId}
          onDone={async () => {
            setAdding(false);
            await load();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          data-testid="med-add-open"
          className="w-full rounded-xl border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-600 active:bg-stone-50"
        >
          + Add a medicine or supplement
        </button>
      )}

      <EventHistory
        familyId={familyId}
        kidId={lane.kidId}
        type="medicine"
        refreshKey={laneKey(lane.events)}
        onChanged={lane.refresh}
      />
    </BabyPageShell>
  );
}

function AddMedication({
  familyId,
  kidId,
  onDone,
  onCancel,
}: {
  familyId: string;
  kidId: string | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [every, setEvery] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!kidId) return;
    if (!name.trim()) {
      toast.error("What is it called?");
      return;
    }
    const interval = parseInterval(every);
    if (interval === "invalid") {
      toast.error("Hours should be a number, like 6 or 24.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("medications").insert({
      family_id: familyId,
      kid_id: kidId,
      name: name.trim(),
      dose: dose.trim() || null,
      interval_hours: interval,
    });
    setSaving(false);
    if (error) {
      toast.error("That didn't save. Try again?");
      return;
    }
    toast.success(`${name.trim()} added`);
    await onDone();
  }

  const field =
    "w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4" data-testid="med-add">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Vitamin D drops)" className={field} data-testid="med-add-name" />
      <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose, exactly as on the label" className={field} data-testid="med-add-dose" />
      <input
        value={every}
        inputMode="decimal"
        onChange={(e) => setEvery(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="Every how many hours? (blank = as needed)"
        className={field}
        data-testid="med-add-every"
      />
      <p className="text-xs text-stone-500">
        Use the dose on the label or the one your pediatrician gave you. This app records doses; it
        never works one out.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-stone-200 px-3 py-3 text-sm text-stone-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          data-testid="med-add-save"
          className="flex-1 rounded-xl bg-stone-800 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </section>
  );
}
