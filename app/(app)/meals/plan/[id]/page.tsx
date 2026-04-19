import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MealPlanWeek } from "@/components/meals/MealPlanWeek";

interface Props {
  params: Promise<{ id: string }>;
}

function formatWeekRange(mondayIso: string): string {
  const monday = new Date(mondayIso + "T12:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default async function MealPlanPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("id, week_start_date, meal_plan_entries(id, date, meal_type, recipe_id, notes, recipes(id, title))")
    .eq("id", id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  if (!plan) notFound();

  // Load all recipes for the swap picker
  const { data: allRecipes } = await supabase
    .from("recipes")
    .select("id, title")
    .eq("family_id", membership.family_id)
    .order("title");

  type EntryRaw = {
    id: string;
    date: string;
    meal_type: string;
    recipe_id: string | null;
    notes: string | null;
    recipes: { id: string; title: string } | null;
  };

  const entries = (plan.meal_plan_entries as EntryRaw[]).map(e => ({
    id: e.id,
    date: e.date,
    mealType: e.meal_type as "breakfast" | "lunch" | "dinner",
    recipeId: e.recipe_id,
    recipeTitle: e.recipes?.title ?? null,
    notes: e.notes,
  }));

  const recipes = (allRecipes ?? []).map(r => ({ id: r.id, title: r.title }));

  return (
    <main className="min-h-screen bg-amber-50/30">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/meals" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
              ← Meals
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">
              Meal Plan — {formatWeekRange(plan.week_start_date)}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {entries.filter(e => e.recipeId).length} of {entries.length} meals planned
            </p>
          </div>
          <Link
            href="/meals"
            className="text-sm font-medium text-orange-600 hover:text-orange-800 border border-orange-200 rounded-xl px-3 py-1.5 hover:bg-orange-50 transition-all"
          >
            Generate new plan
          </Link>
        </div>

        <MealPlanWeek entries={entries} recipes={recipes} />
      </div>
    </main>
  );
}
