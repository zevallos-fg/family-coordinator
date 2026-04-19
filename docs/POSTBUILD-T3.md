# POSTBUILD-T3 — Meal Planning Deferred Items

## Schema mismatches resolved at build time (no migration needed, adapted in code)

- `recipes.title` (not `name`) — adapted
- `recipes.instructions` — stored as `JSON.stringify(string[])`, parsed in `RecipeDetailPage`
- `recipes.cook_time_min` + `recipes.prep_time_min` (no `total_time_min`) — using `cook_time_min` for total time
- `ingredients.canonical_name` (separate from `name`) — both set to same value on insert
- `recipe_ingredients.amount` (not `quantity`) — adapted
- `pantry_items.amount` (not `quantity`), `expires_on` (not `expires_at`) — adapted
- `meal_plans` has no `status` column — removed status=draft from insert
- `grocery_items` has `quantity: string | null`, no `unit` column, no `source` column — combined qty+unit into formatted string; source tracking not possible without migration

## Preferences UI

The meal planner `generatePlanAction` uses hardcoded defaults: `servingsPerMeal=4, dislikes=[], dietaryConstraints=[], varietyPreference="medium"`. A preferences UI needs to be built to let families configure these. Suggested location: `/meals/preferences` page with a DB-backed preferences table or JSON in `families` metadata.

## Ingredient alias table

The pantry autocomplete uses `ilike` fuzzy search on `canonical_name`. Common aliases ("evoo" → "olive oil", "EVOO" → "olive oil") are not handled. A separate `ingredient_aliases` table mapping alias → canonical_name would improve UX significantly.

## Past plans viewer

The meal plan index (`/meals/plan`) redirects to the latest plan. There is no paginated list of past plans. Post-MVP: show last 4 weeks of plans with week labels.

## Meal swap UX

The swap modal shows all recipes alphabetically. Post-MVP improvements:
- Filter by meal type (breakfast-appropriate recipes first)
- Show ingredient overlap with pantry
- Allow "use leftovers" as a no-recipe option

## Source tracking in grocery_items

The `grocery_items` table has no `source` text column — only `source_capture_id` (FK to captures). Items written by the meal planner cannot be easily distinguished from capture-sourced items without a schema migration. Suggested: add `source text DEFAULT NULL` column in a future migration.

## Recipe images

Recipes have no image URL stored. The recipe importer could extract the `og:image` meta tag from the HTML and store it in a `thumbnail_url` column added to `recipes`. Currently recipe cards use an emoji placeholder.

## Pantry refresh after add/edit

The Pantry page is a Server Component. After `addPantryItemAction` or `updatePantryItemAction`, `revalidatePath` triggers a re-render, but the client-side `PantryList` holds local state for optimistic updates. The `onRefresh` callback prop is wired but not used by the current Server Component architecture. Post-MVP: convert pantry page to a hybrid with client-side optimistic updates.
