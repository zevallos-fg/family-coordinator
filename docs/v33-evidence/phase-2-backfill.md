# Phase 2 Backfill Evidence — v33.0.0

Run date: 2026-04-25T11:55:01.774Z
Duration: 12.5s
Total grocery_items processed: 76

## Results

| Tier | Action | Count |
|------|--------|-------|
| 1 - Exact match | Auto-applied (ingredient_id set) | 41 |
| 2 - Fuzzy match (≥0.6) | Auto-applied (ingredient_id set) | 17 |
| 3 - Haiku (pending review) | Logged to ingredient_resolution_log | 18 |
| 4 - Unmatched | Not applied | 0 |
| **Total** | | **76** |

## Errors
None

## Review Surface
Run the following to see Haiku-pending items:
```sql
select * from grocery_backfill_review;
```

Or to see all unresolved items:
```sql
select count(*) from grocery_items where ingredient_id is null;
```
