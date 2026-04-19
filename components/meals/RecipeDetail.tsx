"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteRecipeAction } from "@/app/(app)/meals/actions";
import { useRouter } from "next/navigation";

interface Ingredient {
  canonicalName: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
}

interface RecipeDetailProps {
  id: string;
  title: string;
  servings: number | null;
  cookTimeMin: number | null;
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

export function RecipeDetail({ id, title, servings, cookTimeMin, sourceUrl, instructions, ingredients }: RecipeDetailProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    setDeleting(true);
    const result = await deleteRecipeAction(id);
    if (result.error) {
      alert(result.error);
      setDeleting(false);
    } else {
      router.push("/meals/recipes");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <Link href="/meals/recipes" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
          ← Back to recipes
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-gray-900">{title}</h1>

        <div className="mt-3 flex flex-wrap gap-2">
          {servings && (
            <span className="inline-flex items-center gap-1 text-sm bg-orange-50 text-orange-700 rounded-full px-3 py-1 font-medium">
              👥 {servings} servings
            </span>
          )}
          {cookTimeMin && (
            <span className="inline-flex items-center gap-1 text-sm bg-amber-50 text-amber-700 rounded-full px-3 py-1 font-medium">
              ⏱ {cookTimeMin} min
            </span>
          )}
        </div>

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
      </section>

      {/* Actions */}
      <div className="pt-4 border-t border-gray-100">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete recipe"}
        </button>
      </div>
    </div>
  );
}
