# family-ingredient-resolver

**Tier:** haiku
**Track:** T2 (grocery dedup)

## Purpose

Resolves a cleaned ingredient name against a family's existing ingredient catalog using Claude Haiku.
Used as Tier 3 in the three-tier resolver after exact and fuzzy matching fail.

## Input

```typescript
{
  cleanedName: string;       // descriptor-stripped ingredient name
  candidates: Array<{
    id: string;
    canonical_name: string;
  }>;
}
```

## Output

```typescript
{
  resolvedId: string | null;   // UUID of matched ingredient, or null
  confidence: "haiku" | "unmatched";
}
```

## Examples

Input: `{ cleanedName: "scallion", candidates: [{ id: "...", canonical_name: "green onion" }] }`
Output: `{ resolvedId: "<green-onion-id>", confidence: "haiku" }`

Input: `{ cleanedName: "zaatar powder", candidates: [...] }`
Output: `{ resolvedId: null, confidence: "unmatched" }`

## Cost

~50-100 input tokens + 20-30 output tokens per call.
Approximately $0.002 per resolution at Haiku pricing.

## When it runs

Only called if:
1. Exact match (Tier 1) misses
2. Fuzzy pg_trgm match with similarity >= 0.6 (Tier 2) misses

Result is logged to `ingredient_resolution_log` with `confidence='haiku'`.
Haiku results are NOT auto-applied to `grocery_items.ingredient_id` — they require
review via the `grocery_backfill_review` view.
