"use client";

import { useState } from "react";
import { Pill, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { medicinePayload, nextDueLabel, parseInterval } from "@/lib/baby/medicine";
import { formatTimeOfDay } from "@/lib/baby/format";
import { SOURCES } from "@/lib/care/rules";
import type { CareLog, CareMed } from "./useCare";

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";

/**
 * A grown-up's medicines: what was taken, when the next one is due, and a
 * phone notification when it is. The dose is whatever the label or the
 * prescription says, typed as-is; the app never works one out.
 */
export function MedsSection({
  familyId,
  personId,
  meds,
  logs,
  nowMs,
  onSaved,
}: {
  familyId: string;
  personId: string;
  meds: CareMed[];
  logs: CareLog[];
  nowMs: number;
  onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [every, setEvery] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const active = meds.filter((m) => m.active);
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const todayDoses = logs.filter((l) => l.kind === "dose" && Date.parse(l.at) >= startOfToday.getTime());

  async function given(m: CareMed) {
    if (!m.id) return;
    const { error } = await createClient()
      .from("care_logs")
      .insert({ family_id: familyId, person_user_id: personId, kind: "dose", payload: medicinePayload({ id: m.id, name: m.name, dose: m.dose }) });
    if (error) toast.error("That didn't save. Try again?");
    else {
      toast.success(`${m.name} logged`);
      onSaved();
    }
  }

  async function stop(m: CareMed) {
    if (!m.id) return;
    const { error } = await createClient().from("care_medications").update({ active: false }).eq("id", m.id);
    if (error) toast.error("Couldn't stop it.");
    else onSaved();
  }

  async function add() {
    const interval = parseInterval(every);
    if (!name.trim() || interval === "invalid" || (interval !== null && interval > 168)) {
      toast.error("Add a name, and how often in hours (or leave it blank for as needed).");
      return;
    }
    setBusy(true);
    const { error } = await createClient()
      .from("care_medications")
      .insert({
        family_id: familyId,
        person_user_id: personId,
        name: name.trim(),
        dose: dose.trim() || null,
        interval_hours: interval,
        purpose: purpose.trim() || null,
      });
    setBusy(false);
    if (error) {
      toast.error("That didn't save. Try again?");
      return;
    }
    setName("");
    setDose("");
    setEvery("");
    setPurpose("");
    setAdding(false);
    onSaved();
  }

  return (
    <section className="space-y-2.5" data-testid="care-meds">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">Medicines</h2>
      {active.length === 0 && !adding && (
        <p className="rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-500">
          Nothing tracked yet. Add each medicine as it&apos;s written on the label or prescription.
        </p>
      )}
      {active.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {active.map((m) => {
            const due = nextDueLabel(m.next_due_at, nowMs);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                    <Pill className="h-3.5 w-3.5 text-amber-600" aria-hidden /> {m.name}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {[m.dose, m.interval_hours ? `every ${m.interval_hours}h` : "as needed", m.purpose].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`block text-xs ${due?.overdue ? "font-medium text-amber-700" : "text-stone-500"}`}>
                    {m.last_dose_at ? `Last ${formatTimeOfDay(m.last_dose_at)}` : "Not logged yet"}
                    {due ? ` · ${due.text}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <button type="button" onClick={() => void given(m)} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white" data-testid="care-med-given">
                    Taken
                  </button>
                  <button type="button" onClick={() => void stop(m)} className="text-[11px] text-stone-500">
                    Stop
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form
          className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input className={field} placeholder="Medicine name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className={field} placeholder="Dose, exactly as on the label" value={dose} onChange={(e) => setDose(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={field} inputMode="decimal" placeholder="Every … hours" value={every} onChange={(e) => setEvery(e.target.value)} />
            <input className={field} placeholder="For (e.g. pain)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              Add medicine
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 text-sm text-stone-500">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-600 py-2.5 text-sm text-violet-600"
          data-testid="care-med-add"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a medicine
        </button>
      )}

      {todayDoses.length > 0 && (
        <p className="text-xs text-stone-500">
          Today:{" "}
          {todayDoses
            .map((l) => `${(l.payload as { name?: string }).name ?? "dose"} ${formatTimeOfDay(l.at)}`)
            .join(" · ")}
        </p>
      )}

      <div className="space-y-1 rounded-xl bg-stone-100 px-3 py-2.5 text-xs text-stone-600">
        <p>
          Breastfeeding: each medicine can be looked up in LactMed, the NIH database on medicines and breastfeeding — or ask the
          pharmacist or doctor.
        </p>
        <a href={SOURCES.lactmed.url} target="_blank" rel="noreferrer" className="block text-[11px] text-amber-700 underline underline-offset-2">
          {SOURCES.lactmed.title}
        </a>
        <p className="pt-1">
          Rheumatoid arthritis often flares after delivery. Review RA medicines with the rheumatologist and say you&apos;re breastfeeding —
          many, but not all, are compatible.
        </p>
        <a href={SOURCES.acr.url} target="_blank" rel="noreferrer" className="block text-[11px] text-amber-700 underline underline-offset-2">
          {SOURCES.acr.title}
        </a>
        <a href={SOURCES.arthritisFoundation.url} target="_blank" rel="noreferrer" className="block text-[11px] text-amber-700 underline underline-offset-2">
          {SOURCES.arthritisFoundation.title}
        </a>
      </div>
    </section>
  );
}
