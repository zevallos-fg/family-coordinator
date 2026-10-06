"use client";

import { useState } from "react";
import { Footprints, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { addDays, startOfDay } from "@/lib/baby/reports";
import {
  ACTIVITIES,
  BREASTFEEDING_EXERCISE,
  NutritionError,
  RA_GUIDANCE,
  WEEKLY_MINUTES,
  dayTotals,
  exerciseGate,
  minutesSince,
  movePayload,
  targetsFor,
  type Activity,
  type MovePayload,
  type MoveRow,
} from "@/lib/care/nutrition";
import { foodRows } from "./FoodSection";
import { NoteItem } from "./ExpertFood";
import { AFTER_CLEARANCE, BEFORE_CLEARANCE, STRENGTH_ACTIVITIES, STRENGTH_START_PER_WEEK } from "@/lib/care/experts";
import type { CareLog, CareProfile, FoodGoals } from "./useCare";

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";
const link = "block text-[11px] text-amber-700 underline underline-offset-2";

const QUICK: Array<{ activity: Activity; minutes: number; label: string }> = [
  { activity: "walk", minutes: 10, label: "Walk 10 min" },
  { activity: "walk", minutes: 20, label: "Walk 20 min" },
  { activity: "stretch", minutes: 10, label: "Stretch 10 min" },
  { activity: "pelvic_floor", minutes: 5, label: "Pelvic floor 5 min" },
];

const labelOf = (a: string) => ACTIVITIES.find((x) => x.value === a)?.label ?? a;

function moveRows(logs: CareLog[]): MoveRow[] {
  return logs.filter((l) => l.kind === "move").map((l) => ({ at: l.at, payload: l.payload as unknown as MovePayload }));
}

/**
 * Movement, logged in minutes. After a cesarean there's no weekly goal until
 * she marks the day her OB cleared her (ACOG); after that, 150 minutes a week.
 * Rows carry a source so Oura and Whoop can write here later.
 */
export function MoveSection({
  familyId,
  personId,
  first,
  logs,
  profile,
  nowMs,
  onSaved,
}: {
  familyId: string;
  personId: string;
  first: string;
  logs: CareLog[];
  profile: CareProfile | null;
  nowMs: number;
  onSaved: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const [activity, setActivity] = useState<Activity>("walk");
  const [minutes, setMinutes] = useState("");
  const [clearing, setClearing] = useState<string | null>(null);

  const rows = moveRows(logs);
  const dayStart = startOfDay(nowMs);
  const today = logs.filter((l) => l.kind === "move" && Date.parse(l.at) >= dayStart).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const todayMin = minutesSince(rows, dayStart);
  const weekMin = minutesSince(rows, nowMs - 7 * 86_400_000);
  const gate = exerciseGate(profile);
  const ra = profile?.conditions?.includes("rheumatoid_arthritis");
  const strengthWeek = rows.filter((r) => STRENGTH_ACTIVITIES.includes(r.payload?.activity) && Date.parse(r.at) >= nowMs - 7 * 86_400_000).length;

  async function log(payload: MovePayload) {
    const { error } = await createClient()
      .from("care_logs")
      .insert({ family_id: familyId, person_user_id: personId, kind: "move", payload: payload as never });
    if (error) toast.error("That didn't save. Try again?");
    else {
      toast.success(`${labelOf(payload.activity)} ${payload.minutes} min logged`);
      onSaved();
    }
  }

  async function addCustom() {
    try {
      await log(movePayload({ activity, minutes, source: "manual" }));
      setMinutes("");
      setCustom(false);
    } catch (e) {
      toast.error(e instanceof NutritionError ? e.message : "Check the minutes.");
    }
  }

  async function remove(id: string) {
    const { error } = await createClient().from("care_logs").delete().eq("id", id);
    if (error) toast.error("Couldn't remove it.");
    else onSaved();
  }

  async function saveCleared(date: string | null) {
    const { error } = await createClient()
      .from("care_profiles")
      .update({ exercise_cleared_on: date, updated_at: new Date().toISOString() })
      .eq("person_user_id", personId);
    if (error) toast.error("That didn't save.");
    else {
      setClearing(null);
      onSaved();
    }
  }

  return (
    <section className="space-y-2.5" data-testid="care-move">
      <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-stone-400">
        <Footprints className="h-3.5 w-3.5" aria-hidden /> Movement
      </h2>

      <div className="space-y-2.5 rounded-2xl border border-stone-200 bg-white p-3.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-stone-800">Today</span>
          <span className="tabular-nums text-stone-800">
            {todayMin} <span className="text-stone-500">min</span>
          </span>
        </div>
        <div className="space-y-1" data-testid="move-week">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-stone-800">Last 7 days</span>
            <span className="tabular-nums text-stone-800">
              {weekMin}
              {!gate.gated && ` / ${WEEKLY_MINUTES}`} <span className="text-stone-500">min</span>
            </span>
          </div>
          {!gate.gated && (
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.min(1, weekMin / WEEKLY_MINUTES) * 100}%` }} />
            </div>
          )}
        </div>

        {!gate.gated && (
          <p className="text-xs text-stone-600" data-testid="move-strength">
            Strength sessions, last 7 days: <span className="tabular-nums text-stone-800">{strengthWeek}</span> · Dr. Lyon starts at{" "}
            {STRENGTH_START_PER_WEEK} a week
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => void log({ activity: q.activity, minutes: q.minutes, source: "manual" })}
              className="rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-700 active:bg-stone-200"
              data-testid={`move-quick-${q.activity}-${q.minutes}`}
            >
              + {q.label}
            </button>
          ))}
          <button type="button" onClick={() => setCustom((v) => !v)} className="rounded-full px-3 py-1.5 text-xs text-violet-600">
            Other…
          </button>
        </div>
        {custom && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addCustom();
            }}
          >
            <select className={field} value={activity} onChange={(e) => setActivity(e.target.value as Activity)} aria-label="Activity">
              {ACTIVITIES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <input className={`${field} w-24`} inputMode="numeric" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes" />
            <button type="submit" className="rounded-lg bg-violet-600 px-3 text-sm text-white">
              Add
            </button>
          </form>
        )}

        {today.length > 0 && (
          <ul className="space-y-1">
            {today.map((l) => {
              const m = l.payload as unknown as MovePayload;
              return (
                <li key={l.id} className="flex items-center justify-between text-xs text-stone-600">
                  <span>
                    {new Date(l.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()} · {labelOf(m.activity)} {m.minutes} min
                    {m.source && m.source !== "manual" ? ` · ${m.source}` : ""}
                  </span>
                  <button type="button" onClick={() => void remove(l.id)} className="p-1 text-stone-400" aria-label="Remove">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-1.5 rounded-xl bg-stone-100 px-3 py-2.5 text-xs text-stone-600" data-testid="move-guidance">
        <p className={gate.gated ? "font-medium text-stone-800" : ""}>{gate.text}</p>
        <a href={gate.source.url} target="_blank" rel="noreferrer" className={link}>
          {gate.source.title}
        </a>
        {profile?.delivery_type === "cesarean" &&
          (clearing !== null ? (
            <div className="flex gap-2 pt-1">
              <input type="date" className={field} value={clearing} onChange={(e) => setClearing(e.target.value)} aria-label="Cleared on" />
              <button type="button" onClick={() => void saveCleared(clearing || null)} className="rounded-lg bg-violet-600 px-3 text-sm text-white">
                Save
              </button>
            </div>
          ) : gate.gated ? (
            <button type="button" onClick={() => setClearing(new Date(nowMs).toLocaleDateString("en-CA"))} className="pt-1 text-violet-600" data-testid="move-cleared">
              The OB cleared {first} for exercise →
            </button>
          ) : (
            <button type="button" onClick={() => setClearing(profile.exercise_cleared_on ?? "")} className="pt-1 text-stone-500">
              Cleared by the OB on {profile.exercise_cleared_on} · change
            </button>
          ))}
        {profile?.lactating && (
          <>
            <p className="pt-1">{BREASTFEEDING_EXERCISE.text}</p>
          </>
        )}
        <div className="space-y-1.5 pt-1.5" data-testid="move-experts">
          <p className="font-medium text-stone-700">{gate.gated ? "Dr. Lyon & Dr. Sims, until she's cleared" : "Dr. Lyon & Dr. Sims, building back"}</p>
          {(gate.gated ? BEFORE_CLEARANCE : AFTER_CLEARANCE).map((n, i) => (
            <NoteItem key={i} n={n} />
          ))}
        </div>
        {ra && (
          <div className="space-y-1.5 pt-1.5" data-testid="move-ra">
            <p className="font-medium text-stone-700">Rheumatoid arthritis</p>
            {RA_GUIDANCE.map((g, i) => (
              <div key={i}>
                <p>
                  {g.text} <span className="text-stone-500">({g.strength})</span>
                </p>
                <a href={g.source.url} target="_blank" rel="noreferrer" className={link}>
                  {g.source.title}
                </a>
              </div>
            ))}
            <p>The guideline is meant alongside RA medicines, not instead of them.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The last 7 days at a glance: protein, fiber and minutes moved, each marked
 * when it reached its target. A table, so every number is readable.
 */
export function WeekTable({ logs, profile, goals, nowMs }: { logs: CareLog[]; profile: CareProfile | null; goals: FoodGoals; nowMs: number }) {
  const food = foodRows(logs);
  const move = moveRows(logs);
  const targets = targetsFor(!!profile?.lactating, goals);
  const today = startOfDay(nowMs);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const cols = days.map((start) => {
    const end = addDays(start, 1);
    const inDay = <T extends { at: string }>(r: T) => Date.parse(r.at) >= start && Date.parse(r.at) < end;
    const t = dayTotals(food.filter(inDay));
    return { start, entries: t.entries, protein: t.totals.protein_g ?? null, fiber: t.totals.fiber_g ?? null, minutes: minutesSince(move.filter(inDay), start, end) };
  });
  if (!cols.some((c) => c.entries > 0 || c.minutes > 0)) return null;
  const cell = (v: number | null, target?: number) =>
    v === null ? (
      <span className="text-stone-400">—</span>
    ) : (
      <span className={target && v >= target ? "font-medium text-violet-600" : "text-stone-800"}>{Math.round(v)}</span>
    );
  return (
    <section className="space-y-1.5" data-testid="care-week">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">Last 7 days</h2>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white px-3 py-2.5">
        <table className="w-full text-center text-xs tabular-nums">
          <thead>
            <tr className="text-[11px] text-stone-500">
              <th className="text-left font-normal" />
              {cols.map((c) => (
                <th key={c.start} className="font-normal">
                  {new Date(c.start).toLocaleDateString("en-US", { weekday: "narrow" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 text-left text-stone-600">Protein g</td>
              {cols.map((c) => (
                <td key={c.start}>{cell(c.protein, targets.protein_g?.value)}</td>
              ))}
            </tr>
            <tr>
              <td className="py-1 text-left text-stone-600">Fiber g</td>
              {cols.map((c) => (
                <td key={c.start}>{cell(c.fiber, targets.fiber_g?.value)}</td>
              ))}
            </tr>
            <tr>
              <td className="py-1 text-left text-stone-600">Moved min</td>
              {cols.map((c) => (
                <td key={c.start}>{c.minutes ? cell(c.minutes) : <span className="text-stone-400">—</span>}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="pt-1 text-[11px] text-stone-500">Purple = reached the target that day. — = nothing logged, which isn’t the same as zero.</p>
      </div>
    </section>
  );
}
