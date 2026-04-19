import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecipeDetail } from "@/components/meal-plans/RecipeDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: Props) {
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

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, title, description, servings, prep_time_min, cook_time_min, tags, source_url, instructions, recipe_ingredients(amount, unit, notes, ingredients(canonical_name))")
    .eq("id", id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  if (!recipe) notFound();

  let instructions: string[] = [];
  if (recipe.instructions) {
    try {
      const parsed = JSON.parse(recipe.instructions);
      instructions = Array.isArray(parsed) ? parsed : [recipe.instructions];
    } catch {
      instructions = [recipe.instructions];
    }
  }

  const ingredients = (recipe.recipe_ingredients as Array<{
    amount: number | null;
    unit: string | null;
    notes: string | null;
    ingredients: { canonical_name: string } | null;
  }>)
    .filter(ri => ri.ingredients)
    .map(ri => ({
      canonicalName: ri.ingredients!.canonical_name,
      amount: ri.amount,
      unit: ri.unit,
      notes: ri.notes,
    }));

  return (
    <RecipeDetail
      id={recipe.id}
      title={recipe.title}
      description={recipe.description}
      servings={recipe.servings}
      prepTimeMin={recipe.prep_time_min}
      cookTimeMin={recipe.cook_time_min}
      tags={recipe.tags}
      sourceUrl={recipe.source_url}
      instructions={instructions}
      ingredients={ingredients}
    />
  );
}
