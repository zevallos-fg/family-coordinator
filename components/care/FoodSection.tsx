"use client";

import { useState } from "react";
import { Check, Plus, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { startOfDay } from "@/lib/baby/reports";
import {
  CALORIE_GUIDANCE,
  MAIN_KEYS,
  MEALS,
  MICRO_KEYS,
  NUTRIENTS,
  NUTRITION_SOURCES,
  NutritionError,
  SEAFOOD,
  SUPPLEMENT_NOTE,
  dayTotals,
  foodPayload,
  mealFor,
  nutrient,
  progress,
  recentFoods,
  targetsFor,
  type FoodPayload,
  type FoodRow,
  type Meal,
  type NutrientKey,
  type ProgressRow,
} from "@/lib/care/nutrition";
import type { CareLog, CareProfile, FoodGoals } from "./useCare";
import { ExpertFoodDetails, MealProteinRow, ProteinGoalPicker, proteinGoalSource } from "./ExpertFood";

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";
const link = "block text-[11px] text-amber-700 underline underline-offset-2";

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function foodRows(logs: CareLog[]): FoodRow[] {
  return logs.filter((l) => l.kind === "food").map((l) => ({ at: l.at, payload: l.payload as unknown as FoodPayload }));
}

function Bar({ row, big }: { row: ProgressRow; big?: boolean }) {
  const share = row.share === null ? 0 : Math.min(1, row.share);
  const met = row.share !== null && row.share >= 1;
  const partial = row.entries > 0 && row.covered < row.entries;
  return (
    <div className="space-y-1" data-testid={`food-bar-${row.key}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={big ? "text-sm text-stone-800" : "text-xs text-stone-700"}>{row.label}</span>
        <span className={`tabular-nums ${big ? "text-sm text-stone-800" : "text-xs text-stone-700"}`}>
          {row.value === null ? "—" : num(row.value)}
          {row.target ? ` / ${num(row.target.value)}` : ""} <span className="text-stone-500">{row.unit}</span>
          {met && <Check className="ml-1 inline h-3.5 w-3.5 text-violet-600" aria-label="met" />}
        </span>
      </div>
      {row.target && (
        <div className={`overflow-hidden rounded-full bg-stone-100 ${big ? "h-2.5" : "h-1.5"}`}>
          <div className="h-full rounded-full bg-violet-600" style={{ width: `${share * 100}%` }} />
        </div>
      )}
      {partial && row.value !== null && (
        <p className="text-[11px] text-stone-500" title="Only some foods had this number, so the total is a floor.">
          {big ? `from ${row.covered} of ${row.entries} foods — the rest had no number` : `from ${row.covered} of ${row.entries} foods`}
        </p>
      )}
    </div>
  );
}

function shortLine(n: FoodPayload["nutrients"]) {
  return [
    n.protein_g !== undefined ? `P ${num(n.protein_g)}g` : null,
    n.fiber_g !== undefined ? `F ${num(n.fiber_g)}g` : null,
    n.kcal !== undefined ? `${num(n.kcal)} kcal` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What she ate today against the published breastfeeding intakes — protein,
 * fiber, then vitamins and minerals — with calories against her own goal.
 * One tap repeats a usual food; anything Claude logged from chat is marked
 * "est." because its numbers are an estimate.
 */
export function FoodSection({
  familyId,
  personId,
  first,
  logs,
  profile,
  goals,
  nowMs,
  onSaved,
}: {
  familyId: string;
  personId: string;
  first: string;
  logs: CareLog[];
  profile: CareProfile | null;
  goals: FoodGoals;
  nowMs: number;
  onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);
  const [name, setName] = useState("");
  const [meal, setMeal] = useState<Meal>(() => mealFor(new Date(nowMs).getHours()));
  const [values, setValues] = useState<Partial<Record<NutrientKey, string>>>({});
  const [seafood, setSeafood] = useState("");
  const [guess, setGuess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kcalGoal, setKcalGoal] = useState<string | null>(null);
  const [pickingProtein, setPickingProtein] = useState(false);

  const all = foodRows(logs);
  const dayStart = startOfDay(nowMs);
  const today = all.filter((r) => Date.parse(r.at) >= dayStart).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const todayIds = logs.filter((l) => l.kind === "food" && Date.parse(l.at) >= dayStart).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lactating = !!profile?.lactating;
  const targets = targetsFor(lactating, goals);
  const day = dayTotals(today);
  const main = progress(day, targets, MAIN_KEYS);
  const micros = progress(day, targets, MICRO_KEYS);
  const microsMet = micros.filter((r) => r.share !== null && r.share >= 1).length;
  const microsLogged = micros.filter((r) => r.value !== null).length;
  const repeats = recentFoods(all, 8);
  const weekSeafood = all
    .filter((r) => Date.parse(r.at) >= startOfDay(nowMs - 6 * 86_400_000))
    .reduce((s, r) => s + (Number(r.payload.seafood_oz) || 0), 0);

  async function insert(payload: FoodPayload) {
    const { error } = await createClient()
      .from("care_logs")
      .insert({ family_id: familyId, person_user_id: personId, kind: "food", payload: payload as never });
    if (error) {
      toast.error("That didn't save. Try again?");
      return false;
    }
    onSaved();
    return true;
  }

  async function repeat(f: FoodPayload) {
    const payload: FoodPayload = { ...f, meal: mealFor(new Date().getHours()), source: "repeat" };
    if (await insert(payload)) toast.success(`${f.name} logged`);
  }

  async function add() {
    let payload: FoodPayload;
    try {
      payload = foodPayload({ name, meal, nutrients: values, estimated: guess, source: "manual", seafood_oz: seafood });
    } catch (e) {
      toast.error(e instanceof NutritionError ? e.message : "Check the numbers.");
      return;
    }
    setBusy(true);
    const ok = await insert(payload);
    setBusy(false);
    if (!ok) return;
    setName("");
    setValues({});
    setSeafood("");
    setGuess(false);
    setMore(false);
    setAdding(false);
  }

  async function remove(id: string) {
    const { error } = await createClient().from("care_logs").delete().eq("id", id);
    if (error) toast.error("Couldn't remove it.");
    else onSaved();
  }

  async function saveKcalGoal() {
    const v = kcalGoal?.trim() ? Number(kcalGoal) : null;
    if (v !== null && (!Number.isInteger(v) || v < 1000 || v > 5000)) {
      toast.error("A daily calorie goal between 1000 and 5000.");
      return;
    }
    const d = new Date();
    const { error } = await createClient()
      .from("person_nutrition_targets")
      .insert({
        family_id: familyId,
        user_id: personId,
        start_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        daily_kcal_target: v,
        micronutrient_targets: (goals.overrides ?? null) as never,
        notes: goals.note ?? null,
      });
    if (error) toast.error("That didn't save.");
    else {
      setKcalGoal(null);
      onSaved();
    }
  }

  async function toggleLactating() {
    const { error } = await createClient().from("care_profiles").update({ lactating: !lactating, updated_at: new Date().toISOString() }).eq("person_user_id", personId);
    if (error) toast.error("Couldn't change that.");
    else onSaved();
  }

  return (
    <section className="space-y-2.5" data-testid="care-food">
      <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-stone-400">
        <Utensils className="h-3.5 w-3.5" aria-hidden /> Food today
      </h2>

      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3.5">
        {main.map((r) =>
          r.key === "kcal" && !r.target ? (
            <div key={r.key} className="flex items-baseline justify-between text-sm">
              <span className="text-stone-800">Calories</span>
              <span className="tabular-nums text-stone-800">
                {r.value === null ? "—" : num(r.value)} <span className="text-stone-500">kcal</span>
                {kcalGoal === null && (
                  <button type="button" onClick={() => setKcalGoal("")} className="ml-2 text-xs text-violet-600" data-testid="kcal-goal-set">
                    Set a goal
                  </button>
                )}
              </span>
            </div>
          ) : r.key === "protein_g" ? (
            <div key={r.key} className="space-y-2">
              <Bar row={r} big />
              {!pickingProtein && (
                <button type="button" onClick={() => setPickingProtein(true)} className="-mt-1 text-[11px] text-stone-500" data-testid="protein-goal-open">
                  Goal: {proteinGoalSource(goals) ?? (lactating ? "breastfeeding RDA" : "none set")} · change
                </button>
              )}
              {pickingProtein && (
                <ProteinGoalPicker familyId={familyId} personId={personId} goals={goals} onSaved={onSaved} onClose={() => setPickingProtein(false)} />
              )}
              <MealProteinRow today={today} />
            </div>
          ) : (
            <Bar key={r.key} row={r} big />
          ),
        )}
        {kcalGoal !== null && (
          <div className="space-y-2 rounded-xl bg-stone-100 p-2.5">
            <div className="flex gap-2">
              <input
                className={field}
                inputMode="numeric"
                placeholder="Daily calories, e.g. from her OB or a dietitian"
                value={kcalGoal}
                onChange={(e) => setKcalGoal(e.target.value)}
                autoFocus
                aria-label="Daily calorie goal"
              />
              <button type="button" onClick={() => void saveKcalGoal()} className="rounded-lg bg-violet-600 px-3 text-sm text-white">
                Save
              </button>
            </div>
            <p className="text-[11px] text-stone-600">
              The sources don&apos;t agree on one number for breastfeeding, so there&apos;s no default — see “Where these come from” below.
            </p>
            <button type="button" onClick={() => setKcalGoal(null)} className="text-xs text-stone-500">
              Cancel
            </button>
          </div>
        )}
        {targets.kcal && kcalGoal === null && (
          <button type="button" onClick={() => setKcalGoal(String(targets.kcal?.value ?? ""))} className="-mt-1 text-[11px] text-stone-500">
            Calorie goal is {first}&apos;s own · change
          </button>
        )}

        <details className="group rounded-xl bg-stone-100 px-3 py-2" data-testid="food-micros">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-stone-700">
            <span>Vitamins &amp; minerals</span>
            <span className="text-xs text-stone-500">
              {microsLogged === 0 ? "none logged yet" : lactating ? `${microsMet} of ${micros.length} met` : `${microsLogged} logged`}
            </span>
          </summary>
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
            {micros.map((r) => (
              <Bar key={r.key} row={r} />
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-stone-500">
            Most foods are logged with protein, fiber and calories only, so these fill in when a label or Claude adds them. A
            prenatal or multivitamin can be logged as a food with its label numbers.
          </p>
        </details>

        {lactating && (
          <p className="text-xs text-stone-600" data-testid="food-seafood">
            Seafood this week: <span className="tabular-nums text-stone-800">{num(weekSeafood)}</span> of {SEAFOOD.minOz}–{SEAFOOD.maxOz} oz
          </p>
        )}
      </div>

      {today.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white" data-testid="food-today">
          {todayIds.map((l) => {
            const f = l.payload as unknown as FoodPayload;
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-stone-800">
                    {f.name}
                    {f.estimated && <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10px] text-stone-500">est.</span>}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {[f.meal, shortLine(f.nutrients ?? {}) || "no numbers"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button type="button" onClick={() => void remove(l.id)} className="p-1 text-stone-400" aria-label={`Remove ${f.name}`}>
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {repeats.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="food-repeats">
          {repeats.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => void repeat(f)}
              className="rounded-full bg-white px-3 py-1.5 text-xs text-stone-700 ring-1 ring-stone-200 active:bg-stone-100"
            >
              + {f.name}
            </button>
          ))}
        </div>
      )}

      {adding ? (
        <form
          className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          data-testid="food-form"
        >
          <input className={field} placeholder="What, e.g. Greek yogurt with berries" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="food-name" />
          <div className="flex flex-wrap gap-1.5">
            {MEALS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeal(m)}
                aria-pressed={meal === m}
                className={`rounded-full px-3 py-1 text-xs capitalize ${meal === m ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-700"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["protein_g", "fiber_g", "kcal"] as NutrientKey[]).map((k) => (
              <label key={k} className="text-[11px] text-stone-500">
                {nutrient(k).label} ({nutrient(k).unit})
                <input
                  className={field}
                  inputMode="decimal"
                  value={values[k] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  data-testid={`food-${k}`}
                />
              </label>
            ))}
          </div>
          {more ? (
            <div className="grid grid-cols-3 gap-2">
              {MICRO_KEYS.map((k) => (
                <label key={k} className="text-[11px] text-stone-500">
                  {nutrient(k).label} ({nutrient(k).unit})
                  <input className={field} inputMode="decimal" value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
                </label>
              ))}
              <label className="text-[11px] text-stone-500">
                Seafood (oz)
                <input className={field} inputMode="decimal" value={seafood} onChange={(e) => setSeafood(e.target.value)} />
              </label>
            </div>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="text-xs text-violet-600">
              + Vitamins, minerals, seafood
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={guess} onChange={(e) => setGuess(e.target.checked)} className="h-4 w-4 accent-violet-600" />
            These numbers are a guess
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white disabled:opacity-50" data-testid="food-save">
              Add food
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
          data-testid="food-add"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add food
        </button>
      )}
      <p className="text-xs text-stone-500">Or tell Claude what {first} ate — it estimates the numbers, logs them here, and marks them est.</p>

      <ExpertFoodDetails />

      <details className="rounded-xl bg-stone-100 px-3 py-2.5 text-xs text-stone-600">
        <summary className="cursor-pointer list-none text-stone-700">Where these come from</summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center justify-between gap-2 text-stone-700">
            Use the breastfeeding targets
            <input type="checkbox" checked={lactating} onChange={() => void toggleLactating()} className="h-4 w-4 accent-violet-600" />
          </label>
          <p>
            Targets are the published intakes while breastfeeding, women 19–50 — the RDA, or an AI where no RDA exists. They are what
            most people need, not a plan made for {first}.
          </p>
          <ul className="space-y-1">
            {NUTRIENTS.filter((n) => n.lactation !== null).map((n) => (
              <li key={n.key}>
                <span className="text-stone-700">
                  {n.label}: {num(n.lactation!)} {n.unit}
                </span>{" "}
                {n.basis}
                {n.note ? ` · ${n.note}` : ""}{" "}
                <a href={n.source.url} target="_blank" rel="noreferrer" className="text-amber-700 underline underline-offset-2">
                  source
                </a>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-stone-700">Calories — the sources differ:</p>
          {CALORIE_GUIDANCE.map((g, i) => (
            <div key={i}>
              <p>{g.text}</p>
              <a href={g.source.url} target="_blank" rel="noreferrer" className={link}>
                {g.source.title}
              </a>
            </div>
          ))}
          <p className="pt-1 text-stone-700">Seafood</p>
          <p>{SEAFOOD.text}</p>
          {SEAFOOD.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className={link}>
              {s.title}
            </a>
          ))}
          <p>No US health body gives a DHA amount in milligrams; the seafood guidance is the published advice.</p>
          <a href={NUTRITION_SOURCES.odsOmega3.url} target="_blank" rel="noreferrer" className={link}>
            {NUTRITION_SOURCES.odsOmega3.title}
          </a>
          <p className="pt-1 text-stone-700">Supplements</p>
          <p>{SUPPLEMENT_NOTE.text}</p>
          {SUPPLEMENT_NOTE.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className={link}>
              {s.title}
            </a>
          ))}
        </div>
      </details>
    </section>
  );
}
