import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekPickerNav } from "@/components/ui/WeekPickerNav";
import { MealPlanWeek } from "@/components/meals/MealPlanWeek";
import { MealPlanGenerateClient } from "@/components/meals/MealPlanGenerateClient";
import { parseWeekParam, formatWeekParam, formatWeekRange } from "@/lib/week";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function MealPlanPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const today = new Date();
  const selectedWeek = parseWeekParam(weekParam ?? null, today);
  const weekStr = formatWeekParam(selectedWeek);

  // Canonicalize URL — ensure ?week is always present
  if (!weekParam) {
    redirect(`/meals/plan?week=${weekStr}`);
  }

  const { data: plan } = await supabase
    .from("meal_plans")
    .select(
      "id, week_start_date, created_at, meal_plan_entries(id, date, meal_type, recipe_id, notes, recipes(id, title))"
    )
    .eq("family_id", membership.family_id)
    .eq("week_start_date", weekStr)
    .maybeSingle();

  const { count: recipeCount } = await supabase
    .from("recipes")
    .select("id", { count: "exact", head: true })
    .eq("family_id", membership.family_id);

  const hasRecipes = (recipeCount ?? 0) > 0;

  type EntryRaw = {
    id: string;
    date: string;
    meal_type: string;
    recipe_id: string | null;
    notes: string | null;
    recipes: { id: string; title: string } | null;
  };

  const entries = plan
    ? (plan.meal_plan_entries as EntryRaw[]).map((e) => ({
        id: e.id,
        date: e.date,
        mealType: e.meal_type as "breakfast" | "lunch" | "dinner",
        recipeId: e.recipe_id,
        recipeTitle: e.recipes?.title ?? null,
        notes: e.notes,
      }))
    : [];

  const { data: allRecipes } = plan
    ? await supabase
        .from("recipes")
        .select("id, title")
        .eq("family_id", membership.family_id)
        .order("title")
    : { data: [] };

  const recipes = (allRecipes ?? []).map((r) => ({ id: r.id, title: r.title }));
  const weekLabel = formatWeekRange(selectedWeek);

  return (
    <main className="min-h-screen bg-amber-50/30">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/meals"
            className="text-sm text-orange-600 hover:text-orange-800 font-medium"
          >
            ← Meals
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Meal Plan</h1>
        </div>

        {/* Week picker */}
        <div className="bg-white rounded-xl border border-orange-100 shadow-sm px-4 py-3">
          <WeekPickerNav maxWeeksForward={8} minWeeksBack={4} />
        </div>

        {plan ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {entries.filter((e) => e.recipeId !== null || e.notes).length} of {entries.length} meals planned
              </p>
              {/* Allow replacing the existing plan */}
              <div className="w-auto">
                <MealPlanGenerateClient
                  weekOf={weekStr}
                  weekLabel={weekLabel}
                  hasRecipes={hasRecipes}
                  existingPlanId={plan.id}
                  existingCreatedAt={plan.created_at}
                  compact
                />
              </div>
            </div>
            <MealPlanWeek entries={entries} recipes={recipes} />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Week of {weekLabel}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">No meal plan yet for this week.</p>
            </div>
            <MealPlanGenerateClient
              weekOf={weekStr}
              weekLabel={weekLabel}
              hasRecipes={hasRecipes}
              existingPlanId={null}
              existingCreatedAt={null}
            />
          </div>
        )}
      </div>
    </main>
  );
}
