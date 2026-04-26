# v33.0.0: Dragnet schema + grocery dedup + recipe manual entry + nav repair

## Summary

- **Schema:** 14 additive columns across 4 tables, 5 new tables, 1 PG function, pg_trgm extension, RLS on all new tables
- **Backend:** Three-tier ingredient resolver, `addGroceryItem` single-entry-point for all grocery writes, three write paths (grocery/capture/meal-plans) routed through dedup, store-drop bug fixed
- **Frontend:** GroceryTable with sortable columns + cluster rows, inline merge indicator, manual recipe entry form, Recipes/Pantry nav pills on /meal-plans

## Phase 1 Gate Evidence (schema applied to pmficrajnyeuworrqytn)

```
Q1 — recipes columns (expected 6):        {"count":6} ✅
Q2 — ingredients columns (expected 5):    {"count":5} ✅
Q3 — meal_plan_entries columns (3):       {"count":3} ✅
Q4 — grocery_items columns (5):           {"count":5} ✅
Q5 — 5 new tables:                        {"count":5} ✅
Q6 — existing data intact:                recipes=13, ingredients=108, recipe_ingredients=155, grocery_items=76, meal_plan_entries=21 ✅
Q7 — pg_trgm extension:                   {"count":1} ✅
Q8 — RLS enabled on all new tables:       5 rows, all rowsecurity=true ✅
```

## Phase 2 Gate Evidence

```
Q9 — fn_grocery_upsert exists:  proname=fn_grocery_upsert, pronargs=7 ✅
Q11 — fn_ingredient_fuzzy_search exists: proname=fn_ingredient_fuzzy_search, pronargs=3 ✅
```

## Phase 4 Test Evidence

```
Test Files  17 passed | 12 skipped (29)
     Tests  127 passed | 12 skipped (139)
tsc --noEmit: exit 0, no errors
```

12 skipped = pre-existing `it.skip` stubs for v34 placeholder skills (not regressions).

## New files

- `supabase/migrations/20260425_v33_dragnet_backfill.sql`
- `supabase/migrations/20260425_v33_grocery_upsert_function.sql`
- `lib/grocery/strip-descriptors.ts` + test
- `lib/grocery/resolve-ingredient.ts` + test
- `lib/grocery/dedup.ts`
- `components/grocery/GroceryTable.tsx`
- `skills/family-ingredient-resolver/`
- `tests/integration/grocery-dedup.test.ts`
- `tests/e2e/` (4 new Playwright specs)
- `docs/TECH_DEBT.md` (full rewrite)
- `docs/v33-evidence/` (phase evidence files)

## Test plan

- [ ] Load `/grocery` — table with sortable columns renders
- [ ] Sort by Item asc/desc works
- [ ] Load `/meal-plans` — Recipes and Pantry pills visible
- [ ] Click Recipes pill → `/meal-plans/recipes` loads
- [ ] Click Import → three tabs (URL, Photo, Manual) visible
- [ ] Manual tab → fill form → recipe created with descriptor in notes
- [ ] Add a grocery item → toast shows
- [ ] Add duplicate → teal merge banner appears → submit → merged toast

🤖 Generated with [Claude Code](https://claude.com/claude-code)
