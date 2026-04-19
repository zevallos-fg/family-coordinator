import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { withSkillContext } from "@/lib/skill-action";
import * as recipeImporter from "@/skills/family-recipe-importer";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB (Vercel Hobby ceiling is 4.5MB)
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Find family
    const { data: membership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const familyId = membership?.family_id;
    if (!familyId) {
      return NextResponse.json({ error: "No family found" }, { status: 400 });
    }

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image must be 4MB or smaller (was ${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 400 }
      );
    }
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
      return NextResponse.json(
        { error: `Image must be JPEG, PNG, or WEBP (got ${file.type})` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageBase64 = buffer.toString("base64");

    // Invoke skill
    const result = await withSkillContext(recipeImporter.run, {
      mode: "image",
      imageBase64,
      imageMimeType: file.type as SupportedImageType,
    });

    if (!result.ok) {
      if (result.error?.code === "budget_exceeded") {
        return NextResponse.json(
          { error: "Family monthly AI budget reached" },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: result.error?.message ?? "Recipe import failed" },
        { status: 500 }
      );
    }

    const recipe = result.data!;

    // Upsert ingredients
    const ingredientIds: Record<string, string> = {};
    for (const ing of recipe.ingredients) {
      const { data: existing } = await supabase
        .from("ingredients")
        .select("id")
        .eq("family_id", familyId)
        .eq("canonical_name", ing.canonicalName)
        .maybeSingle();

      if (existing) {
        ingredientIds[ing.canonicalName] = existing.id;
      } else {
        const { data: inserted } = await supabase
          .from("ingredients")
          .insert({
            family_id: familyId,
            canonical_name: ing.canonicalName,
            name: ing.canonicalName,
          })
          .select("id")
          .single();
        if (inserted) ingredientIds[ing.canonicalName] = inserted.id;
      }
    }

    // Insert recipe
    const { data: newRecipe, error: recipeErr } = await supabase
      .from("recipes")
      .insert({
        family_id: familyId,
        title: recipe.name,
        source_url: "",
        servings: recipe.servings,
        cook_time_min: recipe.totalTimeMin ?? null,
        instructions: JSON.stringify(recipe.instructions),
        created_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (recipeErr || !newRecipe) {
      return NextResponse.json({ error: "Failed to save recipe" }, { status: 500 });
    }

    // Insert recipe_ingredients
    const ingredientRows = recipe.ingredients
      .filter((ing) => ingredientIds[ing.canonicalName])
      .map((ing) => ({
        recipe_id: newRecipe.id,
        ingredient_id: ingredientIds[ing.canonicalName],
        amount: ing.quantity,
        unit: ing.unit,
        notes: ing.note,
      }));

    if (ingredientRows.length > 0) {
      await supabase.from("recipe_ingredients").insert(ingredientRows);
    }

    return NextResponse.json({ recipeId: newRecipe.id });
  } catch (err) {
    console.error("import-from-photo failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown server error" },
      { status: 500 }
    );
  }
}