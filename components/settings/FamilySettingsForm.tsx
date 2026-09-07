"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateDefaultServes, updateDayStartTime } from "@/app/(app)/settings/actions";

interface Props {
  familyId: string;
  defaultServes: number;
  /** "07:00:00" from Postgres; the input wants "07:00". */
  dayStartTime: string;
}

export function FamilySettingsForm({
  familyId,
  defaultServes: initial,
  dayStartTime,
}: Props) {
  const initialDayStart = dayStartTime.slice(0, 5);
  const [serves, setServes] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [dayStart, setDayStart] = useState(initialDayStart);
  const [savingDay, setSavingDay] = useState(false);

  async function handleSaveDayStart() {
    setSavingDay(true);
    const result = await updateDayStartTime(familyId, dayStart);
    setSavingDay(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Day start saved");
    }
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateDefaultServes(familyId, serves);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Settings saved");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <div>
        <label
          htmlFor="default-serves"
          className="block text-sm font-medium text-stone-700 mb-1"
        >
          Default meal plan servings
        </label>
        <p className="text-xs text-stone-400 mb-3">
          How many people each meal should serve. Used when generating meal plans.
        </p>
        <div className="flex items-center gap-3">
          <select
            id="default-serves"
            value={serves}
            onChange={(e) => setServes(Number(e.target.value))}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "person" : "people"}
              </option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={saving || serves === initial}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="border-t border-stone-100 pt-4">
        <label
          htmlFor="day-start"
          className="block text-sm font-medium text-stone-700 mb-1"
        >
          Day starts at
        </label>
        <p className="text-xs text-stone-400 mb-3">
          When one day&apos;s tracking rolls over into the next. A sleep that crosses
          midnight belongs to the day it started in, so &ldquo;last night&rsquo;s sleep&rdquo;
          is still there in the morning. Set 00:00 for a plain midnight boundary.
        </p>
        <div className="flex items-center gap-3">
          <input
            id="day-start"
            type="time"
            value={dayStart}
            onChange={(e) => setDayStart(e.target.value)}
            className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={handleSaveDayStart}
            disabled={savingDay || dayStart === initialDayStart || !dayStart}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {savingDay ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
