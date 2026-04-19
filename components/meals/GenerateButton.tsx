"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generatePlanAction } from "@/app/(app)/meals/actions";
import { Button } from "@/components/ui/button";

interface GenerateButtonProps {
  weekOf: string;
  hasRecipes: boolean;
}

export function GenerateButton({ weekOf, hasRecipes }: GenerateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const result = await generatePlanAction(weekOf);
      if (result.error) {
        setError(result.error);
      } else if (result.planId) {
        router.push(`/meals/plan/${result.planId}`);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!hasRecipes) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm mb-4">You need at least one recipe before generating a meal plan.</p>
        <a href="/meals/recipes/import" className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors">
          Import your first recipe
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full text-lg py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-3">
            <span className="animate-spin text-xl">🌀</span>
            Generating your meal plan…
          </span>
        ) : (
          "✨ Generate This Week's Plan"
        )}
      </Button>

      {loading && (
        <div className="rounded-xl bg-orange-50 border border-orange-100 p-4 text-center">
          <p className="text-sm text-orange-700 font-medium">Claude is planning your week…</p>
          <p className="text-xs text-orange-500 mt-1">Balancing variety, pantry, and grocery costs. Takes 15–20 seconds.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}
