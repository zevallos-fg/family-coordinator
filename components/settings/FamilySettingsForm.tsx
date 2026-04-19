"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateDefaultServes } from "@/app/(app)/settings/actions";

interface Props {
  familyId: string;
  defaultServes: number;
}

export function FamilySettingsForm({ familyId, defaultServes: initial }: Props) {
  const [serves, setServes] = useState(initial);
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
