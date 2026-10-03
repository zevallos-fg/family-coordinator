"use client";

import { useState } from "react";
import { BOTTLE_UNITS, type BottleUnit } from "@/lib/baby/bottle";

function unitKey(familyId: string) {
  return `baby.bottleUnit.${familyId}`;
}

/**
 * The last unit used, so a family that measures in oz is not asked every time.
 *
 * Read in the state initializer: both callers mount only after a tap (the
 * Bottle tab, the Manual entry toggle), so this never runs during the server
 * render and cannot cause a hydration mismatch.
 */
export function useBottleUnit(familyId: string) {
  const [unit, setUnitState] = useState<BottleUnit>(() => {
    try {
      const stored = window.localStorage.getItem(unitKey(familyId));
      return BOTTLE_UNITS.includes(stored as BottleUnit) ? (stored as BottleUnit) : "ml";
    } catch {
      return "ml";
    }
  });
  function setUnit(next: BottleUnit) {
    setUnitState(next);
    try {
      window.localStorage.setItem(unitKey(familyId), next);
    } catch {
      // Not remembered; harmless.
    }
  }
  return [unit, setUnit] as const;
}

/**
 * Amount + unit + contents. Shared by the Bottle tab and manual entry so a
 * bottle is entered the same way wherever it is entered.
 */
export function BottleFields({
  amount,
  onAmount,
  unit,
  onUnit,
  contents,
  onContents,
  testPrefix,
}: {
  amount: string;
  onAmount: (v: string) => void;
  unit: BottleUnit;
  onUnit: (u: BottleUnit) => void;
  contents: string;
  onContents: (v: string) => void;
  testPrefix: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
          Amount
        </span>
        <div className="mt-1 flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            value={amount}
            data-testid={`${testPrefix}-amount`}
            onChange={(e) => onAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0"
            className="w-28 bg-transparent text-4xl tabular-nums text-stone-900 placeholder-stone-200 focus:outline-none"
          />
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1">
            {BOTTLE_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                data-testid={`${testPrefix}-unit-${u}`}
                aria-pressed={unit === u}
                onClick={() => onUnit(u)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  unit === u ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-400">
          Contents
        </span>
        <input
          value={contents}
          data-testid={`${testPrefix}-contents`}
          onChange={(e) => onContents(e.target.value)}
          className="mt-1 w-full bg-transparent text-base text-stone-800 focus:outline-none"
        />
      </div>
    </div>
  );
}
