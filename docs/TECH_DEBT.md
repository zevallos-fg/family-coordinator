# Tech Debt — Family Coordinator v20
*Logged by autonomous build — 2026-04-18*

## Architecture
- **Modularization**: single-file HTML (v8.4 pattern) works for current scope. At ~150KB+ it's approaching maintainability limits. Component extraction to separate files + a build step would help. Trigger: next major feature addition.
- **State management**: ad-hoc useState + prop drilling. When v20 is stable, consider useContext or Zustand for shared state (recipes, pantry, ingredients). Not needed yet — current prop chain is traceable.
- **Apps Script row-per-record vs blob**: v8.4 sheets use JSON blobs in A1; v20 sheets use row-per-record. Two storage paradigms in one spreadsheet. Acceptable for now; unify if migrating to Supabase.

## Features deferred from v20 scope
- **Tasks/Digests/Documents/Maintenance/MealLog/PersonNutritionTarget UX** — stubs with headers only. Schema exists; no UI.
- **Calorie tracking UX** — nutrition data collected (barcode, USDA future, OPEN FoodFacts). Daily/weekly totals not surfaced.
- **Structured per-step recipe timing** — methodSteps is prose. Per-step timing deferred.
- **Voice recipe capture** — Mental Dump can catch meal ideas; recipe creation via voice deferred.
- **Costco PDF receipts** — explicitly out of scope (§3g). Requires PDF parsing.
- **Pregnancy-stage dietary filters UX** — dietaryTags schema ready; filter UI not built.
- **Pantry-driven recipe suggestions UX** — schema ready (can query pantry + RecipeIngredients); UI not built.
- **Restaurant/eating-out capture** — no flow exists.
- **Family recipe guided entry (Yenny's memory)** — oral history capture deferred.
- **Full automated recipe-notes summarization** — lite notes appended; auto-summarize to "current best version" deferred.

## Technical gaps
- **Recipe image dragnet to Drive**: `uploadBinary()` is in Apps Script but the v20 Add Recipe flow doesn't call it. Image is sent to Haiku for extraction but not archived to Drive. Fix: after Haiku returns, call Apps Script `uploadBinary` and store Drive file ID on Recipe.sourceImage.
- **Barcode Haiku vision fallback**: `/extract-barcode-wrapper` endpoint deployed but not triggered in current barcode flow (no product image available from barcode decode alone). To complete: add "Scan package" step in barcode flow that takes a photo of the wrapper when Open Food Facts returns nothing.
- **Grocery projection deduplication**: when a recipe is assigned to a meal slot, its ingredients are added to grocery list without checking for duplicates. Add dedup by ingredientId on projection.
- **Meal plan slot "undo cooked"**: no reverse path from cooked→planned. Add long-press or swipe-to-undo.
- **appsscript.json filename**: file is `appsscript.json` (correct per clasp). Legacy comment in build prompt said filename missing `.json` extension — not accurate, file is correct. Resolved.
- **Apps Script legacy `action === "anthropic"` branch**: removed in v20 Code.gs. Confirmed before next deploy.

## Testing
- **No automated tests** — Playwright E2E suite deferred. Manual test checklist in HANDOFF.md §21b.
- **No unit tests for rotation engine** — pure function, easy to test. Add when test infrastructure exists.

## Performance
- **Babel standalone compilation**: ~1-2s parse time on first load for 153KB file. Acceptable; replace with pre-compiled build if it grows past 250KB.
- **v20 poll interval**: 30s for new sheets. May feel slow if two users are editing simultaneously. Consider event-driven invalidation when moving to Supabase.

## v34.0.0 — P0

**family-school-brief — removed.** Skill stub deleted in v34 P0. No schema for school newsletters. Revisit when school inbox triage becomes priority.

## Future migration path
- **Supabase / Postgres**: when Google Sheets limits bind (~5M cells). Schema is designed for relational migration. Apps Script `weeklyBackup()` provides JSON snapshot for migration. All IDs are UUIDs.
- **Obsidian integration**: for long-form/narrative content (family memory, decision log). Explicitly a separate system — not a v20 concern.
