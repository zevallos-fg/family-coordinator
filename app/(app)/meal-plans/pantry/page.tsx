import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PantryList } from "@/components/meal-plans/PantryList";
import { PantryAddForm } from "@/components/meal-plans/PantryAddForm";

export default async function PantryPage() {
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

  const { data: pantryRaw } = await supabase
    .from("pantry_items")
    .select("id, amount, unit, expires_on, ingredients(canonical_name)")
    .eq("family_id", membership.family_id)
    .order("created_at", { ascending: false });

  const pantryItems = (pantryRaw ?? []).map(p => ({
    id: p.id,
    ingredientName: (p.ingredients as { canonical_name: string } | null)?.canonical_name ?? "unknown",
    amount: p.amount,
    unit: p.unit,
    expiresOn: p.expires_on,
  }));

  return (
    <main className="min-h-screen bg-amber-50/30">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/meal-plans" className="text-sm text-orange-600 hover:text-orange-800 font-medium">
            ← Meal Plans
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Pantry</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            What you have on hand — the meal planner uses this to minimize your grocery list.
          </p>
        </div>

        <PantryAddForm />
        <PantryList items={pantryItems} />
      </div>
    </main>
  );
}
