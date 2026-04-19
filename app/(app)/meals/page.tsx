import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GenerateButton } from "@/components/meals/GenerateButton";

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - (day === 0 ? 6 : day - 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function formatWeekRange(mondayIso: string): string {
  const monday = new Date(mondayIso + "T12:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default async function MealsPage() {
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

  const weekOf = getMondayOfCurrentWeek();

  // Check for existing plan this week
  const { data: currentPlan } = await supabase
    .from("meal_plans")
    .select("id, week_start_date")
    .eq("family_id", membership.family_id)
    .eq("week_start_date", weekOf)
    .maybeSingle();

  // Count recipes
  const { count: recipeCount } = await supabase
    .from("recipes")
    .select("id", { count: "exact", head: true })
    .eq("family_id", membership.family_id);

  const hasRecipes = (recipeCount ?? 0) > 0;
  const weekLabel = formatWeekRange(weekOf);

  return (
    <main className="min-h-screen bg-amber-50/30">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Meal Planning</h1>
          <p className="text-gray-500 mt-1 text-sm">Recipes, pantry, and your week — all in one place.</p>
        </div>

        {/* Navigation tabs */}
        <nav className="flex gap-2 bg-white rounded-2xl shadow-sm border border-orange-100 p-1.5">
          {[
            { href: "/meals", label: "This Week", icon: "📅" },
            { href: "/meals/recipes", label: "Recipes", icon: "📖" },
            { href: "/meals/pantry", label: "Pantry", icon: "🥫" },
          ].map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-700 transition-all"
            >
              {tab.icon} {tab.label}
            </Link>
          ))}
        </nav>

        {/* This week's plan or generation CTA */}
        <section className="bg-white rounded-2xl shadow-sm border border-orange-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">This Week</h2>
              <p className="text-sm text-gray-400 mt-0.5">{weekLabel}</p>
            </div>
            {currentPlan && (
              <Link
                href={`/meals/plan?week=${weekOf}`}
                className="text-sm font-medium text-orange-600 hover:text-orange-800"
              >
                View plan →
              </Link>
            )}
          </div>

          {currentPlan ? (
            <div className="rounded-xl bg-green-50 border border-green-100 p-4">
              <p className="text-sm text-green-700 font-medium">Meal plan generated for this week.</p>
              <Link href={`/meals/plan?week=${weekOf}`} className="text-sm text-green-600 hover:underline">
                View 7-day grid →
              </Link>
            </div>
          ) : (
            <GenerateButton weekOf={weekOf} hasRecipes={hasRecipes} />
          )}
        </section>

        {/* Quick links */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/meals/recipes" className="group bg-white rounded-2xl border border-orange-100 shadow-sm p-5 hover:shadow-md hover:border-orange-200 transition-all">
            <div className="text-3xl mb-2">📖</div>
            <h3 className="font-semibold text-gray-800 group-hover:text-orange-700 transition-colors">Recipe Library</h3>
            <p className="text-sm text-gray-400 mt-1">
              {hasRecipes ? `${recipeCount} recipe${recipeCount !== 1 ? "s" : ""} saved` : "No recipes yet — import one"}
            </p>
          </Link>

          <Link href="/meals/pantry" className="group bg-white rounded-2xl border border-orange-100 shadow-sm p-5 hover:shadow-md hover:border-orange-200 transition-all">
            <div className="text-3xl mb-2">🥫</div>
            <h3 className="font-semibold text-gray-800 group-hover:text-orange-700 transition-colors">Pantry</h3>
            <p className="text-sm text-gray-400 mt-1">Track what you have so the AI buys only what you need</p>
          </Link>
        </section>

        {!hasRecipes && (
          <div className="text-center py-4">
            <Link
              href="/meals/recipes/import"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-2xl shadow transition-all"
            >
              Import your first recipe
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
