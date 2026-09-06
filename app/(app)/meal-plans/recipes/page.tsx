import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RecipeCard } from "@/components/meal-plans/RecipeCard";
import { requireFamily } from "@/lib/auth/current-family";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, description, servings, prep_time_min, cook_time_min, tags, source_url, recipe_ingredients(ingredient_id)")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-amber-50/30">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/meal-plans" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
              ← Meal Plans
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Recipe Library</h1>
          </div>
          <Link
            href="/meal-plans/recipes/import"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow transition-all"
          >
            + Import Recipe
          </Link>
        </div>

        {!recipes || recipes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🍽️</div>
            <h2 className="text-xl font-semibold text-gray-700">No recipes yet</h2>
            <p className="text-gray-400 text-sm mt-2 mb-6">
              Paste any recipe URL to import it — AllRecipes, NYT Cooking, and most sites work.
            </p>
            <Link
              href="/meal-plans/recipes/import"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-2xl shadow transition-all"
            >
              Import Your First Recipe
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recipes.map(r => (
              <RecipeCard
                key={r.id}
                id={r.id}
                title={r.title}
                description={r.description}
                servings={r.servings}
                prepTimeMin={r.prep_time_min}
                cookTimeMin={r.cook_time_min}
                tags={r.tags}
                sourceUrl={r.source_url}
                ingredientCount={r.recipe_ingredients?.length ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
