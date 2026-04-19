# T3 — Meal Planning — Complete

## Shipped

- **Recipe import** (URL → family-recipe-importer → DB): paste any recipe URL, Haiku extracts structured data, stored in `recipes` + `ingredients` + `recipe_ingredients`
- **Recipe library** with card grid, ingredient count badges, time/servings metadata
- **Recipe detail page** with full ingredient list and step-by-step instructions
- **Pantry management** with ingredient autocomplete (ilike fuzzy search), quantity editing, expiry tracking, remove
- **Meal plan generation (flagship)**: Sonnet 4.6 generates 7-day plan with grocery delta in ~15s
  - Respects dietary constraints, dislikes, variety preference
  - Pantry-aware: subtracts on-hand quantities from grocery delta
  - Hallucinated recipeId sanitization (post-generation Zod + id validation)
- **7-day plan grid**: responsive week view, 3 meals × 7 days, recipe swap modal
- **Grocery integration**: writes grocery delta items to `grocery_items` table for T2's Grocery tab

## Skills implemented

- `family-recipe-importer` (Haiku, ~$0.002/call) — `skills/family-recipe-importer/`
- `family-meal-planner` (Sonnet 4.6, ~$0.05/call) — `skills/family-meal-planner/`

## Cross-track

- Writes to `grocery_items` — T2's Grocery tab reads from the same table
- Convention documented at `docs/CONVENTIONS-grocery.md`
- Grocery items from this track: `source_capture_id = NULL`, `quantity` = formatted string with unit

## Tests

- `family-recipe-importer/tests.ts`: 5 tests (fixture extraction, brand stripping, no-recipe page, validation, budget passthrough)
- `family-meal-planner/tests.ts`: 5 tests (plan parsing, hallucinated ID sanitization, empty recipes validation, parse error, grocery delta)
- All 24 tests passing

## POSTBUILD-T3 items

- Preferences UI (servingsPerMeal, dislikes, dietaryConstraints hardcoded to defaults)
- Ingredient alias table (fuzzy matching is best-effort ilike on canonical_name)
- Past plans viewer (shows latest only)
- Meal swap UX (functional but no meal-type filtering)
- Source tracking: `grocery_items` has no `source` text column, only `source_capture_id`
- Recipe images (no thumbnail_url column, emoji placeholder used)

See `docs/POSTBUILD-T3.md` for full details.

## Merge notes for Fernando

- No new migrations required — all tables existed from migration 008
- The `(app)` layout group needs a shell/nav (T2's responsibility) — meals pages are standalone for now
- No dependencies on T2/T4/T5 merging first — grocery_items writes work immediately
- TypeScript clean, all tests passing

T3 complete.
