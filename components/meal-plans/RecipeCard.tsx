"use client";

import Link from "next/link";

interface RecipeCardProps {
  id: string;
  title: string;
  servings: number | null;
  cookTimeMin: number | null;
  sourceUrl: string | null;
  ingredientCount?: number;
}

function timeLabel(min: number | null): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function RecipeCard({ id, title, servings, cookTimeMin, ingredientCount }: RecipeCardProps) {
  return (
    <Link
      href={`/meal-plans/recipes/${id}`}
      className="group block bg-white rounded-2xl shadow-sm border border-orange-100 p-5 hover:shadow-md hover:border-orange-200 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-800 text-base leading-snug group-hover:text-orange-700 transition-colors line-clamp-2">
          {title}
        </h3>
        <div className="text-2xl flex-shrink-0">🍽️</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {servings && (
          <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 rounded-full px-2.5 py-0.5 font-medium">
            👥 {servings} servings
          </span>
        )}
        {cookTimeMin && (
          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 rounded-full px-2.5 py-0.5 font-medium">
            ⏱ {timeLabel(cookTimeMin)}
          </span>
        )}
        {ingredientCount !== undefined && ingredientCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 rounded-full px-2.5 py-0.5 font-medium">
            🌿 {ingredientCount} ingredients
          </span>
        )}
      </div>
    </Link>
  );
}
