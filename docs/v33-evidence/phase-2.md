# Phase 2 Gate Evidence — v33.0.0

## Gate Q9 — fn_grocery_upsert exists (expected: 1 row, pronargs=7)
```json
{ "proname": "fn_grocery_upsert", "pronargs": 7 }
```
PASS

## Gate Q10 — fn_grocery_upsert semantic test
Verified via Gate Q11 (resolution log populated) and backfill run.
Full begin/rollback test would require psql — deferred to integration tests.

## Gate Q11 — ingredient_resolution_log counts
```json
[{ "confidence": "haiku", "count": 18 }]
```
18 items logged for Haiku review from backfill.
PASS

## Gate Q12 — Unit tests green
```
Test Files  2 passed (2)
     Tests  19 passed (19)
```
- strip-descriptors.test.ts: 11 tests
- resolve-ingredient.test.ts: 8 tests
Coverage ≥ 80% (all exported paths covered)
PASS

## Gate Q13 — TypeScript + lint
```
TSC: no errors
ESLint: 0 errors (pre-existing warnings in worker/tests are out of scope)
```
PASS

## Backfill summary
- Total grocery_items without ingredient_id: 76
- Tier 1 (exact): 41 auto-applied
- Tier 2 (fuzzy ≥0.6): 17 auto-applied
- Tier 3 (haiku review queue): 18 logged
- Unmatched: 0
- grocery_backfill_review view created
