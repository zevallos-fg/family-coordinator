import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PlanIndexPage() {
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

  // Redirect to latest plan if one exists
  const { data: latestPlan } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("family_id", membership.family_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestPlan) redirect(`/meals/plan/${latestPlan.id}`);

  return (
    <main className="min-h-screen bg-amber-50/30 flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="text-5xl">📅</div>
        <h2 className="text-xl font-semibold text-gray-700">No meal plans yet</h2>
        <p className="text-gray-400 text-sm">Generate your first plan from the meals home page.</p>
        <Link href="/meals" className="inline-block text-orange-600 hover:text-orange-800 font-medium text-sm">
          ← Back to Meals
        </Link>
      </div>
    </main>
  );
}
