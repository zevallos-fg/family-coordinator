import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeImportForm } from "@/components/meal-plans/RecipeImportForm";

export const maxDuration = 60;

export default async function RecipeImportPage() {
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

  return (
    <main className="min-h-screen bg-amber-50/30">
      <RecipeImportForm />
    </main>
  );
}
