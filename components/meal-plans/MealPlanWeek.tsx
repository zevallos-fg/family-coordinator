"use client";

import { useState } from "react";
import { MealPlanCard } from "./MealPlanCard";
import { swapMealEntryAction } from "@/app/(app)/meal-plans/actions";

interface Entry {
  id: string;
  date: string;
  mealType: "breakfast" | "lunch" | "dinner";
  recipeId: string | null;
  recipeTitle: string | null;
  notes: string | null;
}

interface Recipe { id: string; title: string }

interface MealPlanWeekProps {
  entries: Entry[];
  recipes: Recipe[];
  rationale?: string;
}

const MEAL_TYPES: Array<"breakfast" | "lunch" | "dinner"> = ["breakfast", "lunch", "dinner"];

function formatDayHeader(isoDate: string): { day: string; date: string } {
  const d = new Date(isoDate + "T12:00:00");
  return {
    day: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

export function MealPlanWeek({ entries, recipes, rationale }: MealPlanWeekProps) {
  const [swappingEntryId, setSwappingEntryId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [localEntries, setLocalEntries] = useState<Entry[]>(entries);

  // Group entries by date
  const dates = [...new Set(localEntries.map(e => e.date))].sort();

  function openSwap(entryId: string) {
    setSwappingEntryId(entryId);
  }

  async function doSwap(newRecipeId: string) {
    if (!swappingEntryId) return;
    setSwapping(true);
    const result = await swapMealEntryAction(swappingEntryId, newRecipeId);
    if (!result.error) {
      const recipe = recipes.find(r => r.id === newRecipeId);
      setLocalEntries(prev =>
        prev.map(e =>
          e.id === swappingEntryId
            ? { ...e, recipeId: newRecipeId, recipeTitle: recipe?.title ?? null, notes: null }
            : e
        )
      );
    }
    setSwapping(false);
    setSwappingEntryId(null);
  }

  return (
    <div className="space-y-6">
      {rationale && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl px-5 py-4">
          <p className="text-sm text-orange-800 font-medium mb-1">AI Rationale</p>
          <p className="text-sm text-orange-700">{rationale}</p>
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {dates.map(date => {
          const { day, date: dateStr } = formatDayHeader(date);
          const dayEntries = localEntries.filter(e => e.date === date);

          return (
            <div key={date} className="space-y-2">
              <div className="text-center">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{day}</p>
                <p className="text-sm font-semibold text-gray-700">{dateStr}</p>
              </div>
              {MEAL_TYPES.map(mealType => {
                const entry = dayEntries.find(e => e.mealType === mealType);
                if (!entry) return null;
                return (
                  <MealPlanCard
                    key={entry.id}
                    entryId={entry.id}
                    date={entry.date}
                    mealType={entry.mealType}
                    recipeId={entry.recipeId}
                    recipeTitle={entry.recipeTitle}
                    notes={entry.notes}
                    onSwap={openSwap}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Swap modal */}
      {swappingEntryId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setSwappingEntryId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4">Pick a different recipe</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recipes.map(r => (
                <button
                  key={r.id}
                  onClick={() => doSwap(r.id)}
                  disabled={swapping}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:border-orange-300 hover:bg-orange-50 text-sm font-medium text-gray-700 transition-all disabled:opacity-50"
                >
                  {r.title}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSwappingEntryId(null)}
              className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
