"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importRecipeAction } from "@/app/(app)/meals/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RecipeImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setError("Enter a valid URL (e.g. https://allrecipes.com/recipe/...)");
      return;
    }

    setLoading(true);
    try {
      const result = await importRecipeAction(trimmed);
      if (result.error) {
        setError(result.error);
      } else if (result.recipeId) {
        router.push(`/meals/recipes/${result.recipeId}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href="/meals/recipes" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
        ← Back to recipes
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Import a Recipe</h1>
      <p className="mt-1 text-gray-500 text-sm">
        Paste any recipe URL — AllRecipes, NYT Cooking, Serious Eats, and most others work.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            Recipe URL
          </label>
          <Input
            id="url"
            type="url"
            placeholder="https://www.allrecipes.com/recipe/..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
            className="w-full"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading || !url.trim()} className="w-full">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Importing recipe…
            </span>
          ) : (
            "Import Recipe"
          )}
        </Button>
      </form>

      {loading && (
        <div className="mt-6 rounded-xl bg-orange-50 border border-orange-100 p-4">
          <p className="text-sm text-orange-700 font-medium">Fetching and analyzing the recipe…</p>
          <p className="text-xs text-orange-500 mt-1">This takes 5–10 seconds.</p>
        </div>
      )}
    </div>
  );
}

// need Link in scope
import Link from "next/link";
