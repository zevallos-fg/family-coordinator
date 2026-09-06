import { RecipeImportForm } from "@/components/meal-plans/RecipeImportForm";
import { requireFamily } from "@/lib/auth/current-family";

export const maxDuration = 60;

export default async function RecipeImportPage() {
  // Gate only — the form does its own work client-side.
  await requireFamily();

  return (
    <main className="min-h-screen bg-amber-50/30">
      <RecipeImportForm />
    </main>
  );
}
