# v33.0.0 — RELEASE COMPLETE

**Branch:** `feat/v33-dragnet-grocery-dedup`
**Target:** merge → `main`
**Date:** 2026-04-25
**PR URL:** https://github.com/zevallos-fg/family-coordinator/pull/new/feat/v33-dragnet-grocery-dedup

---

## What shipped

### Schema (applied to pmficrajnyeuworrqytn — production)
- 14 additive columns across `recipes` (6), `ingredients` (5), `meal_plan_entries` (3), `grocery_items` (5)
- 5 new tables: `ingredient_form_units`, `ingredient_resolution_log`, `meal_log`, `person_nutrition_targets`, `maintenance`
- 1 PG function: `fn_grocery_upsert` (7-arg merge/dedup function)
- `pg_trgm` extension (required for Tier-2 fuzzy ingredient matching)
- RLS enabled on all 5 new tables with `fn_user_in_family` policies
- All 8 Phase 1 gate queries pass (see `docs/v33-evidence/phase-1.md`)

### Backend
- `lib/grocery/strip-descriptors.ts` — pure descriptor stripper, 11 unit tests, 100% coverage
- `lib/grocery/resolve-ingredient.ts` — 3-tier resolver (exact → pg_trgm fuzzy → Haiku LLM)
- `lib/grocery/dedup.ts` — `addGroceryItem()` as single entry point for all grocery writes
- All 3 write paths (manual add, capture, meal-plan generation) routed through orchestrator
- `fn_grocery_upsert` PG function handles merge/cluster logic server-side
- Store-drop bug in meal-plan grocery projection fixed (`suggestedStore` now resolved to UUID)

### Frontend
- `GroceryTable` replaces `GroceryList` — sortable Item + Store columns, cluster rows with "needs review" badge, inline store dropdown
- 300ms debounce merge preview on grocery add input (teal banner + "Add & merge" label)
- Toast messages for inserted/merged/review_required/inserted_unmatched outcomes
- Manual recipe entry tab (third tab after URL + Photo) — strict-required gates, descriptor preview
- Recipes and Pantry nav pills restored on `/meal-plans` page

### Tests
- 127 unit + integration tests passing (0 failures)
- 5 dedup orchestrator integration tests (`tests/integration/grocery-dedup.test.ts`)
- 4 Playwright E2E specs (structural verification — execution requires auth session)
- `pnpm tsc --noEmit` exits 0

---

## To complete (manual steps for Fernando)

1. **Open the PR:** https://github.com/zevallos-fg/family-coordinator/pull/new/feat/v33-dragnet-grocery-dedup
   - `gh pr create` requires interactive auth — open in browser

2. **Merge the PR** after CI passes

3. **Post-deploy smoke test** against production:
   - `/grocery` — table with sortable columns
   - `/meal-plans` — Recipes + Pantry pills visible
   - `/meal-plans/recipes/import` — three tabs (URL, Photo, Manual) visible

4. **Check Vercel deploy** — production should auto-deploy on merge to main

---

## Evidence files
- `docs/v33-evidence/phase-1.md` — Phase 1 schema gate queries
- `docs/v33-evidence/phase-2.md` — Phase 2 resolver gate queries
- `docs/v33-evidence/phase-2-backfill.md` — backfill script output
- `docs/v33-evidence/phase-3-design.md` — frontend design spec
- `docs/v33-evidence/phase-4.md` — test results
- `docs/v33-evidence/pr-body.md` — PR description

---

## Path C close-out (2026-04-25)

Two findings from post-cleanup audit fixed before merge:

### F8 — Weekly Digest structured render
- **Was:** digest content rendered as single prose blob; structured `sections[]` and `load_attribution` ignored (dead-code marker left in component)
- **Fix:** `generateDigest` action now stores `JSON.stringify({ summary, sections, load_attribution })` in `content` column (no migration needed — 0 rows). `DigestView` parses JSON, renders sections filtered by `data_present`, renders `load_attribution` as horizontal bar chart. Dead-code marker removed.
- **Commits:** `75416c1`

### F7 — Document Vault polling
- **Was:** `window.location.reload()` after upload; required manual refresh to see Indexing → Indexed transition
- **Fix:** 2s `setInterval` polling via new `getDocumentIndexingStatus` server action. 30s timeout triggers "Indexing failed" + Retry button. Proper cleanup on unmount.
- **Commits:** `659d4dc`

### Sequencing
- v33 PR #1 opened and merged via `gh pr merge --squash` at 2026-04-25
- v34 rebased onto new main — Outcome B (5 conflict files, all mechanical, main wins)
- 3 duplicate commits correctly dropped by git during rebase
- v34 fixes applied on rebased branch
- All gates clean: tsc 0 errors, lint 0 errors, 182 tests passing (2 documented skips)
