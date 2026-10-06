"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { NUTRITION_SOURCES, nutrient, type FoodPayload } from "@/lib/care/nutrition";
import {
  EXPERT_NAMES,
  ExpertError,
  FUELING,
  NOT_APPLIED,
  PER_MEAL_NOTES,
  PER_MEAL_PROTEIN,
  PROTEIN_METHODS,
  proteinByMeal,
  proteinGoalNote,
  proteinRange,
  type Expert,
  type ExpertNote,
} from "@/lib/care/experts";
import type { FoodGoals } from "./useCare";

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";
const link = "block text-[11px] text-amber-700 underline underline-offset-2";
const NOTE_PREFIX = "Protein — ";

/** Where her protein goal came from, read off the saved goal's note. */
export function proteinGoalSource(goals: FoodGoals): string | null {
  if (!goals.overrides?.protein_g) return null;
  const note = goals.note ?? "";
  return note.startsWith(NOTE_PREFIX) ? note.slice(NOTE_PREFIX.length) : "her own goal";
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Protein at each meal against the ~30 g both experts use. */
export function MealProteinRow({ today }: { today: Array<{ payload: FoodPayload }> }) {
  const meals = proteinByMeal(today);
  if (!today.length) return null;
  return (
    <div className="space-y-1" data-testid="meal-protein">
      <div className="grid grid-cols-4 gap-1.5">
        {meals.map((m) => {
          const met = m.meal !== "snack" && m.grams >= PER_MEAL_PROTEIN;
          return (
            <div key={m.meal} className={`rounded-lg px-2 py-1.5 text-center ${met ? "bg-stone-100 ring-1 ring-violet-600" : "bg-stone-100"}`}>
              <span className="block text-[10px] capitalize text-stone-500">{m.meal === "snack" ? "snacks" : m.meal}</span>
              <span className="block text-sm tabular-nums text-stone-800">
                {m.entries ? `${Math.round(m.grams)} g` : "—"}
                {met && <Check className="ml-0.5 inline h-3 w-3 text-violet-600" aria-label="30 g or more" />}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-stone-500">Protein per meal · about {PER_MEAL_PROTEIN} g a meal (Dr. Lyon, Dr. Sims)</p>
    </div>
  );
}

/**
 * Choose the protein goal: the breastfeeding RDA (default), Dr. Lyon's
 * 1 g per pound of goal weight, or Dr. Sims's 0.7–1.0 g per pound of current
 * weight. Saved as a goal with a note saying which and how.
 */
export function ProteinGoalPicker({
  familyId,
  personId,
  goals,
  onSaved,
  onClose,
}: {
  familyId: string;
  personId: string;
  goals: FoodGoals;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<Expert | "rda">("lyon");
  const [weight, setWeight] = useState("");
  let range: { low: number; high: number } | null = null;
  let rangeError: string | null = null;
  if (method !== "rda" && weight.trim()) {
    try {
      range = proteinRange(method, Number(weight));
    } catch (e) {
      rangeError = e instanceof ExpertError ? e.message : "Check the weight.";
    }
  }

  async function save(grams: number | null) {
    const overrides = { ...(goals.overrides ?? {}) };
    if (grams === null) delete overrides.protein_g;
    else overrides.protein_g = grams;
    const { error } = await createClient()
      .from("person_nutrition_targets")
      .insert({
        family_id: familyId,
        user_id: personId,
        start_date: localToday(),
        daily_kcal_target: goals.kcal,
        micronutrient_targets: (Object.keys(overrides).length ? overrides : null) as never,
        notes: grams === null || method === "rda" ? null : NOTE_PREFIX + proteinGoalNote(method, Number(weight), grams),
      });
    if (error) toast.error("That didn't save.");
    else {
      toast.success(grams === null ? "Protein goal back to the breastfeeding RDA" : `Protein goal ${grams} g`);
      onSaved();
      onClose();
    }
  }

  const m = method === "rda" ? null : PROTEIN_METHODS[method];
  return (
    <div className="space-y-2.5 rounded-xl bg-stone-100 p-3" data-testid="protein-goal">
      <div className="flex flex-wrap gap-1.5">
        {(["lyon", "sims", "rda"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMethod(k)}
            aria-pressed={method === k}
            className={`rounded-full px-3 py-1 text-xs ${method === k ? "bg-violet-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}
          >
            {k === "rda" ? `Breastfeeding RDA · ${nutrient("protein_g").lactation} g` : EXPERT_NAMES[k]}
          </button>
        ))}
      </div>
      {m ? (
        <>
          <p className="text-xs text-stone-700">{m.summary}</p>
          <blockquote className="border-l-2 border-violet-600 pl-2 text-[11px] italic text-stone-600">“{m.quote}”</blockquote>
          <a href={m.source.url} target="_blank" rel="noreferrer" className={link}>
            {m.source.title}
          </a>
          <input className={field} inputMode="decimal" placeholder={m.weightLabel} value={weight} onChange={(e) => setWeight(e.target.value)} aria-label={m.weightLabel} />
          {rangeError && <p className="text-xs text-rose-700">{rangeError}</p>}
          {range && (
            <div className="flex gap-2">
              <button type="button" onClick={() => void save(range!.high)} className="flex-1 rounded-lg bg-violet-600 py-2 text-sm text-white" data-testid="protein-goal-high">
                Use {range.high} g ({m.high} g/lb)
              </button>
              <button type="button" onClick={() => void save(range!.low)} className="flex-1 rounded-lg bg-white py-2 text-sm text-stone-800 ring-1 ring-stone-200">
                {range.low} g ({m.low} g/lb)
              </button>
            </div>
          )}
          <p className="text-[11px] text-stone-500">
            Written for adults or active women in general — neither has published a breastfeeding number. Higher than the RDA, which is a
            minimum. Worth mentioning to her OB or a dietitian.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-stone-700">
            {nutrient("protein_g").lactation} g a day — the published intake while breastfeeding (RDA, women 19–50).
          </p>
          <a href={NUTRITION_SOURCES.dri.url} target="_blank" rel="noreferrer" className={link}>
            {NUTRITION_SOURCES.dri.title}
          </a>
          <button type="button" onClick={() => void save(null)} className="w-full rounded-lg bg-violet-600 py-2 text-sm text-white">
            Use the RDA
          </button>
        </>
      )}
      <button type="button" onClick={onClose} className="text-xs text-stone-500">
        Cancel
      </button>
    </div>
  );
}

export function NoteItem({ n }: { n: ExpertNote }) {
  return (
    <div className="space-y-0.5">
      <p>
        <span className="text-stone-700">{EXPERT_NAMES[n.who]}:</span> {n.text}
      </p>
      <blockquote className="border-l-2 border-stone-300 pl-2 text-[11px] italic text-stone-500">“{n.quote}”</blockquote>
      <a href={n.source.url} target="_blank" rel="noreferrer" className={link}>
        {n.source.title}
      </a>
    </div>
  );
}

/** Dr. Lyon and Dr. Sims on food, with where their advice doesn't reach. */
export function ExpertFoodDetails() {
  return (
    <details className="rounded-xl bg-stone-100 px-3 py-2.5 text-xs text-stone-600" data-testid="expert-food">
      <summary className="cursor-pointer list-none text-stone-700">Dr. Lyon &amp; Dr. Sims on food</summary>
      <div className="mt-2 space-y-2.5">
        {PER_MEAL_NOTES.map((n, i) => (
          <NoteItem key={i} n={n} />
        ))}
        <NoteItem n={{ who: "lyon", text: PROTEIN_METHODS.lyon.summary, quote: PROTEIN_METHODS.lyon.quote, source: PROTEIN_METHODS.lyon.source }} />
        <NoteItem n={{ who: "sims", text: PROTEIN_METHODS.sims.summary, quote: PROTEIN_METHODS.sims.quote, source: PROTEIN_METHODS.sims.source }} />
        <NoteItem n={FUELING} />
        <p className="pt-1 font-medium text-stone-700">Where their advice doesn&apos;t reach</p>
        {NOT_APPLIED.map((x, i) => (
          <div key={i} className="space-y-0.5">
            <p>{x.text}</p>
            {x.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className={link}>
                {s.title}
              </a>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}
