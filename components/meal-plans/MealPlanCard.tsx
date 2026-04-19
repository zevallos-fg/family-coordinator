"use client";

import Link from "next/link";

interface MealPlanCardProps {
  mealType: "breakfast" | "lunch" | "dinner";
  recipeId: string | null;
  recipeTitle: string | null;
  notes: string | null;
  entryId: string;
  date?: string;
  onSwap?: (entryId: string) => void;
}

const MEAL_ICONS: Record<string, string> = {
  breakfast: "☀️",
  lunch: "🌤️",
  dinner: "🌙",
};

export function MealPlanCard({ mealType, recipeId, recipeTitle, notes, entryId, onSwap }: MealPlanCardProps) {
  const isLeftover = !recipeId && !!notes;
  const isEmpty = !recipeId && !notes;

  return (
    <div
      className={`rounded-xl p-3 text-sm border transition-all ${
        isEmpty
          ? "bg-gray-50 border-dashed border-gray-200 text-gray-400"
          : isLeftover
          ? "bg-amber-50 border-amber-100"
          : "bg-white border-orange-100 shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {MEAL_ICONS[mealType]} {mealType}
        </span>
        {/* Swap only for recipe entries, not leftovers or empties */}
        {onSwap && !isLeftover && !isEmpty && (
          <button
            onClick={() => onSwap(entryId)}
            className="text-xs text-orange-500 hover:text-orange-700 font-medium"
          >
            Swap
          </button>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs">No meal planned</p>
      ) : isLeftover ? (
        <p className="text-sm text-amber-800 leading-snug">{notes}</p>
      ) : (
        <Link href={`/meal-plans/recipes/${recipeId}`} className="block">
          <p className="font-medium text-gray-800 leading-snug hover:text-orange-700 transition-colors line-clamp-2">
            {recipeTitle}
          </p>
          {notes && <p className="text-xs text-gray-400 mt-1 italic">{notes}</p>}
        </Link>
      )}
    </div>
  );
}
