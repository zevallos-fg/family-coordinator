"use client";

import { useState } from "react";
import { AlertTriangle, Info, Phone } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { checkInWarnings, type CheckIn, type Warning } from "@/lib/care/rules";
import { formatTimeOfDay } from "@/lib/baby/format";
import type { Json } from "@/lib/supabase/database.types";
import type { CareLog } from "./useCare";
import type { Reading } from "./BpSection";

function Chips<T extends string | boolean | number>({
  options,
  value,
  onChange,
  cols,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? undefined : o.value)}
          className={`rounded-lg px-1 py-2 text-xs ${value === o.value ? "bg-violet-600 font-medium text-white" : "bg-stone-100 text-stone-700"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SCALE = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1.5" data-testid="checkin-warnings">
      {warnings.map((w, i) => {
        const Icon = w.level === "911" ? Phone : w.level === "call" ? AlertTriangle : Info;
        return (
          <li
            key={i}
            data-level={w.level}
            className={`rounded-xl px-3 py-2.5 text-sm ${w.level === "info" ? "bg-stone-100 text-stone-700" : "bg-white text-stone-800 ring-2 ring-amber-600"}`}
          >
            <span className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${w.level === "info" ? "text-sky-600" : "text-amber-600"}`} aria-hidden />
              <span>
                {w.level === "911" && <span className="font-semibold">Call 911 · </span>}
                {w.text}
                <a href={w.source.url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11px] text-amber-700 underline underline-offset-2">
                  {w.source.title}
                </a>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Headache and pain by day, as small bars (the day's highest score). */
function ScoreTrend({ logs }: { logs: CareLog[] }) {
  const days = new Map<string, { headache: number; pain: number }>();
  for (const l of logs) {
    if (l.kind !== "checkin") continue;
    const p = l.payload as CheckIn;
    const key = new Date(l.at).toLocaleDateString("en-CA");
    const d = days.get(key) ?? { headache: -1, pain: -1 };
    if (typeof p.headache === "number") d.headache = Math.max(d.headache, p.headache);
    if (typeof p.pain === "number") d.pain = Math.max(d.pain, p.pain);
    days.set(key, d);
  }
  const rows = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  if (rows.length < 2) return null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3" data-testid="score-trend">
      <p className="mb-2 text-[11px] text-stone-500">Highest score each day (0–10)</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px] text-stone-500">
            <th className="text-left font-normal" />
            {rows.map(([k]) => (
              <th key={k} className="font-normal">
                {new Date(`${k}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["headache", "pain"] as const).map((m) => (
            <tr key={m}>
              <td className="py-1 capitalize text-stone-600">{m}</td>
              {rows.map(([k, v]) => (
                <td key={k} className="text-center tabular-nums text-stone-800">
                  {v[m] >= 0 ? v[m] : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A quick recovery check-in: headache, pain, temperature, bleeding, incision,
 * leg, mood, and the 911 signs. Saving shows any warning sign it matches, with
 * the source — and the latest blood pressure is part of that check.
 */
export function CheckInSection({
  familyId,
  personId,
  logs,
  latestBp,
  onSaved,
}: {
  familyId: string;
  personId: string;
  logs: CareLog[];
  latestBp: Reading | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<CheckIn>({});
  const [temp, setTemp] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CheckIn>(k: K, v: CheckIn[K] | undefined) => setC((prev) => ({ ...prev, [k]: v }));
  const last = logs.find((l) => l.kind === "checkin") ?? null;
  const lastAnswers = (last?.payload ?? {}) as CheckIn;
  const lastWarnings = last ? checkInWarnings(lastAnswers, latestBp) : [];

  async function save() {
    const t = temp.trim() ? Number(temp) : undefined;
    if (temp.trim() && (!Number.isFinite(t) || t! < 90 || t! > 110)) {
      toast.error("Temperature in °F, e.g. 98.6");
      return;
    }
    const answers: CheckIn = { ...c, ...(t !== undefined ? { temp_f: t } : {}) };
    setBusy(true);
    const { error } = await createClient()
      .from("care_logs")
      .insert({ family_id: familyId, person_user_id: personId, kind: "checkin", payload: answers as unknown as Json });
    setBusy(false);
    if (error) {
      toast.error("That didn't save. Try again?");
      return;
    }
    setC({});
    setTemp("");
    setOpen(false);
    onSaved();
  }

  const urgent = c.urgent ?? [];
  const toggleUrgent = (u: NonNullable<CheckIn["urgent"]>[number]) =>
    set("urgent", urgent.includes(u) ? urgent.filter((x) => x !== u) : [...urgent, u]);
  const preview = checkInWarnings({ ...c, ...(temp.trim() ? { temp_f: Number(temp) } : {}) }, latestBp);

  return (
    <section className="space-y-2.5" data-testid="checkin-section">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">Recovery check-in</h2>

      {last && !open && (
        <div className="space-y-2">
          <p className="text-xs text-stone-500">
            Last check-in {new Date(last.at).toLocaleDateString("en-US", { weekday: "short" })} {formatTimeOfDay(last.at)}
            {typeof lastAnswers.headache === "number" ? ` · headache ${lastAnswers.headache}/10` : ""}
            {typeof lastAnswers.pain === "number" ? ` · pain ${lastAnswers.pain}/10` : ""}
            {lastAnswers.temp_f ? ` · ${lastAnswers.temp_f}°F` : ""}
          </p>
          <WarningList warnings={lastWarnings} />
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white"
          data-testid="checkin-open"
        >
          Check in now
        </button>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Headache (0 = none)</p>
            <Chips options={SCALE} value={c.headache} onChange={(v) => set("headache", v)} cols={11} />
          </div>
          {(c.headache ?? 0) > 0 && (
            <>
              <div className="space-y-1">
                <p className="text-xs text-stone-600">Lying down, is it…</p>
                <Chips
                  options={[
                    { value: "better" as const, label: "Better" },
                    { value: "same" as const, label: "No different" },
                    { value: "unsure" as const, label: "Not sure" },
                  ]}
                  value={c.headache_lying}
                  onChange={(v) => set("headache_lying", v)}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-stone-600">After pain medicine</p>
                <Chips
                  options={[
                    { value: "better" as const, label: "It got better" },
                    { value: "not_better" as const, label: "Not better" },
                  ]}
                  value={c.headache_after_meds}
                  onChange={(v) => set("headache_after_meds", v)}
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Vision changes (blurry, spots, light hurts)?</p>
            <Chips
              options={[
                { value: false, label: "No" },
                { value: true, label: "Yes" },
              ]}
              value={c.vision_changes}
              onChange={(v) => set("vision_changes", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Incision / belly pain (0–10)</p>
            <Chips options={SCALE} value={c.pain} onChange={(v) => set("pain", v)} cols={11} />
          </div>
          <label className="block text-xs text-stone-600">
            Temperature °F (optional)
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
              placeholder="98.6"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
            />
          </label>
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Bleeding</p>
            <Chips
              options={[
                { value: "light" as const, label: "Light" },
                { value: "moderate" as const, label: "Moderate" },
                { value: "soaking" as const, label: "A pad an hour / big clots" },
              ]}
              value={c.bleeding}
              onChange={(v) => set("bleeding", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Incision</p>
            <Chips
              options={[
                { value: "fine" as const, label: "Looks fine" },
                { value: "red" as const, label: "Red / swollen" },
                { value: "draining" as const, label: "Draining" },
                { value: "not_healing" as const, label: "Not healing" },
              ]}
              value={c.incision}
              onChange={(v) => set("incision", v)}
              cols={2}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-stone-600">A leg red or swollen, painful or warm?</p>
            <Chips
              options={[
                { value: false, label: "No" },
                { value: true, label: "Yes" },
              ]}
              value={c.leg}
              onChange={(v) => set("leg", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Mood today</p>
            <Chips
              options={[
                { value: "good" as const, label: "Good" },
                { value: "ok" as const, label: "Okay" },
                { value: "low" as const, label: "Low" },
              ]}
              value={c.mood}
              onChange={(v) => set("mood", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-stone-600">Any of these right now?</p>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["chest_pain", "Chest pain"],
                  ["breathing", "Trouble breathing"],
                  ["seizure", "Seizure"],
                  ["harm_thoughts", "Thoughts of harming self or others"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={urgent.includes(v)}
                  onClick={() => toggleUrgent(v)}
                  className={`rounded-lg px-2 py-2 text-xs ${urgent.includes(v) ? "bg-amber-600 font-medium text-white" : "bg-stone-100 text-stone-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
            rows={2}
            placeholder="Anything else"
            value={c.note ?? ""}
            onChange={(e) => set("note", e.target.value || undefined)}
          />
          <WarningList warnings={preview} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white disabled:opacity-50" data-testid="checkin-save">
              {busy ? "Saving…" : "Save check-in"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 text-sm text-stone-500">
              Cancel
            </button>
          </div>
        </form>
      )}

      <ScoreTrend logs={logs} />
    </section>
  );
}
