"use client";

import Link from "next/link";

interface RecipeCardProps {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  tags: string[] | null;
  sourceUrl: string | null;
  ingredientCount?: number;
}

function totalTime(prep: number | null, cook: number | null): string | null {
  const total = (prep ?? 0) + (cook ?? 0);
  if (total === 0) return null;
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function RecipeCard({ id, title, description, servings, prepTimeMin, cookTimeMin, tags, ingredientCount }: RecipeCardProps) {
  const timeStr = totalTime(prepTimeMin, cookTimeMin);
  const visibleTags = (tags ?? []).slice(0, 2);

  return (
    <Link
      href={`/meal-plans/recipes/${id}`}
      className="group block bg-white rounded-2xl shadow-sm border border-orange-100 p-5 hover:shadow-md hover:border-orange-200 transition-all space-y-3"
    >
      <div>
        <h3 className="font-semibold text-gray-800 text-base leading-snug group-hover:text-orange-700 transition-colors line-clamp-1">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500 line-clamp-2 leading-snug">{description}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
          {timeStr && <span>{timeStr}</span>}
          {servings && <span>Serves {servings}</span>}
          {ingredientCount !== undefined && ingredientCount > 0 && !timeStr && !servings && (
            <span>{ingredientCount} ingredients</span>
          )}
        </div>
      </div>
    </Link>
  );
}
