"use client";

import Link from "next/link";

interface GenerateButtonProps {
  weekOf: string;
  hasRecipes: boolean;
}

// Used on the /meals hub page — navigates to the plan page where generation happens.
export function GenerateButton({ weekOf, hasRecipes }: GenerateButtonProps) {
  if (!hasRecipes) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm mb-4">You need at least one recipe before generating a meal plan.</p>
        <Link
          href="/meals/recipes/import"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Import your first recipe
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`/meals/plan?week=${weekOf}`}
      className="flex items-center justify-center w-full text-lg py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all"
    >
      Generate This Week&apos;s Plan
    </Link>
  );
}
