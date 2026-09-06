"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteWithUndo } from "@/lib/undo";

interface Ingredient {
  canonicalName: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
}

interface RecipeDetailProps {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  tags: string[] | null;
  sourceUrl: string | null;
  instructions: string[];
  ingredients: Ingredient[];
}

function formatAmount(amount: number | null, unit: string | null): string {
  if (amount === null && unit === null) return "";
  if (amount === null) return unit ?? "";
  const qty = amount % 1 === 0 ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
  return unit ? `${qty} ${unit}` : qty;
}

function timeLine(prepTimeMin: number | null, cookTimeMin: number | null, servings: number | null): string | null {
  const parts: string[] = [];
  if (prepTimeMin) parts.push(`${prepTimeMin} min prep`);
  if (cookTimeMin) parts.push(`${cookTimeMin} min cook`);
  if (servings) parts.push(`Serves ${servings}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function RecipeDetail({
  id, title, description, servings, prepTimeMin, cookTimeMin, tags, sourceUrl, instructions, ingredients,
}: RecipeDetailProps) {
  const router = useRouter();

  const listHref = "/meal-plans/recipes";

  /**
   * One-touch, and the undo is real: fn_soft_delete banks recipe_ingredients along with
   * the recipe and remembers which meal_plan_entries pointed at it, so fn_restore brings
   * the whole thing back — ingredients and plan links included.
   */
  async function handleDelete() {
    // Leave immediately. The recipe keeps its id through fn_restore, so if the delete
    // fails or the user undoes it, this URL is still the right one to come back to.
    router.push(listHref);

    await deleteWithUndo({
      table: "recipes",
      ids: [id],
      message: `${title} deleted`,
      onShow: () => router.push(`${listHref}/${id}`),
      onHide: () => router.push(listHref),
      onSettled: () => router.refresh(),
    });
  }

  const metaLine = timeLine(prepTimeMin, cookTimeMin, servings);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <Link href="/meal-plans/recipes" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
          ← Meal Plans
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-gray-900">{title}</h1>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-block text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Meta line: prep · cook · serves */}
        {metaLine && (
          <p className="mt-3 text-sm text-gray-500">{metaLine}</p>
        )}

        {/* Description */}
        {description && (
          <p className="mt-3 text-gray-600 leading-relaxed">{description}</p>
        )}

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-600 hover:underline break-all"
          >
            View original →
          </a>
        )}
      </div>

      {/* Ingredients */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-3">Ingredients</h2>
        <ul className="space-y-2">
          {ingredients.map((ing, i) => (
            <li key={i} className="flex items-baseline gap-2 text-gray-700">
              <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0 mt-1.5" />
              <span>
                <span className="font-medium capitalize">{ing.canonicalName}</span>
                {(ing.amount !== null || ing.unit) && (
                  <span className="text-gray-500 ml-1">— {formatAmount(ing.amount, ing.unit)}</span>
                )}
                {ing.notes && (
                  <span className="text-gray-400 text-sm ml-1">({ing.notes})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Instructions */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-3">Instructions</h2>
        {instructions.length > 0 ? (
          <ol className="space-y-4">
            {instructions.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-gray-700 leading-relaxed pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-400 italic">No instructions yet. Edit to add them.</p>
        )}
      </section>

      {/* Actions */}
      <div className="pt-4 border-t border-gray-100">
        <button
          onClick={handleDelete}
          className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
        >
          Delete recipe
        </button>
      </div>
    </div>
  );
}
