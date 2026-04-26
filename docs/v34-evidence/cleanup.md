# v34.0.0 Pre-merge Cleanup Evidence

**Date:** 2026-04-25
**Branch:** feat/v34-session-b-features-batch
**Executor:** Autonomous cleanup run

---

## Phase 1 — family-school-brief deletion

### Gate: git ls-tree HEAD -- skills/family-school-brief

**Before (HEAD before cleanup):**
```
040000 tree 44e1b32e71c0e8cb585840a1066ef6d056982082  skills/family-school-brief
```

**After commit 45b6dba:**
```
(empty — no output)
```

Gate: PASSED. Directory no longer tracked in git.

**Active code reference check:**
```
grep -rn "family-school-brief" app/ lib/ components/ tests/
→ NO ACTIVE CODE REFERENCES
```

---

## Phase 2 — Test skips

### Skipped test audit

**Found via grep:**
```
skills/family-blind-spot-detector/tests.ts:4:  it.skip("not implemented - T6", () => {
skills/family-caregiver-employment/tests.ts:4:  it.skip("not implemented - T8", () => {
```

**Classification:**
- Both are stub skills with placeholder `index.ts` (Input/Output are `{ placeholder?: string }`)
- No business logic exists to test
- Ticket references: T6 and T8 (future sprint items)
- **Verdict: (a) Legitimate** — not bug-masking

**Actions taken:**
- Added SKIP-REASON comment above each `it.skip` in committed versions
- Added "Legitimate test skips" table to docs/TECH_DEBT.md

**Test suite gate:**
```
Test Files  25 passed | 2 skipped (27)
Tests  177 passed | 2 skipped (179)
```

Gate: PASSED. Same 2 skipped, each with SKIP-REASON comment + TECH_DEBT entry.

---

## Phase 3 — TypeScript errors

### Initial tsc output

```
components/grocery/GroceryTable.tsx(4,43): error TS2305: Module '"@/app/(app)/grocery/actions"' has no exported member 'updateGroceryStore'.
lib/grocery/dedup.ts(76,58): error TS2345: Argument of type '"fn_grocery_upsert"' is not assignable to parameter of type '"fn_accept_invite" | ...
lib/grocery/dedup.ts(92,15): error TS2352: Conversion of type 'string' to type '{ grocery_item_id: string; action: string; }' may be a mistake...
lib/grocery/resolve-ingredient.ts(60,53): error TS2345: Argument of type '"fn_ingredient_fuzzy_search"' is not assignable to parameter of type ...
scripts/backfill-grocery-ingredient-ids.ts(96,55): error TS2345: Argument of type '"fn_ingredient_fuzzy_search"' is not assignable to parameter of type ...
scripts/backfill-grocery-ingredient-ids.ts(102,38): error TS2339: Property 'length' does not exist on type 'number'.
scripts/backfill-grocery-ingredient-ids.ts(103,20): error TS7053: Element implicitly has an 'any' type because expression of type '0' can't be used to index type 'Number'.
Exit code: 2
```

### Fix: Regenerated database.types.ts

```bash
npx supabase gen types typescript --project-id pmficrajnyeuworrqytn > lib/supabase/database.types.ts
```

**Verification of fn_grocery_upsert in new types:**
```typescript
fn_grocery_upsert: {
  Args: {
    p_family_id: string
    p_ingredient_id: string
    p_qty_unit: string
    p_qty_value: number
    p_raw_name?: string
    p_source_capture_id?: string
    p_store_id: string
  }
  Returns: {
    action: string
    grocery_item_id: string
  }[]
}
```

**Verification of fn_ingredient_fuzzy_search in new types:**
```typescript
fn_ingredient_fuzzy_search: {
  Args: { p_family_id: string; p_name: string; p_threshold?: number }
  Returns: {
    canonical_name: string
    id: string
    sim: number
  }[]
}
```

### Fix: Added updateGroceryStore to grocery/actions.ts

GroceryTable.tsx imported `updateGroceryStore` but it was never exported. Added the server action.

### Fix: Removed `any` from dedup.ts

Replaced `eslint-disable + const rpcArgs: any` with individual casts at call site:
- `p_ingredient_id: (ingredientId ?? null) as string` — uuid nullable, Postgres accepts null
- `p_store_id: (storeId ?? null) as string` — uuid nullable, Postgres accepts null
- `p_source_capture_id: sourceCaptureId ?? undefined` — optional, matches type

### Final tsc gate:

```
npx tsc --noEmit → Exit code: 0
```

Gate: PASSED.

---

## Phase 4 — Storage migration

### Migration applied

File: `supabase/migrations/20260425_v34_family_documents_bucket.sql`
Applied via: `npx supabase db query --linked --file supabase/migrations/20260425_v34_family_documents_bucket.sql`

### Q1: Bucket verification

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'family-documents';
```

**Result:**
```json
{
  "rows": [
    {
      "allowed_mime_types": [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/webp",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain"
      ],
      "file_size_limit": 26214400,
      "id": "family-documents",
      "name": "family-documents",
      "public": false
    }
  ]
}
```

Gate Q1: PASSED. 1 row, public=false, file_size_limit=26214400.

### Q2: RLS policies verification

```sql
select policyname from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname like 'family_documents_%';
```

**Result:**
```json
{
  "rows": [
    { "policyname": "family_documents_delete" },
    { "policyname": "family_documents_insert" },
    { "policyname": "family_documents_read" },
    { "policyname": "family_documents_update" }
  ]
}
```

Gate Q2: PASSED. 4 rows as expected.

---

## Phase 5 — Final sanity

### Test suite
```
Test Files  25 passed | 2 skipped (27)
Tests  177 passed | 2 skipped (179)
```

### TypeScript
```
npx tsc --noEmit → Exit code: 0
```

### Lint
```
npm run lint → 0 errors, 29 warnings
```

Lint fixes applied:
- 6x `@next/next/no-html-link-for-pages` — replaced `<a href>` with `<Link>` in trips/[id], trips/new, vendors/[id], vendors/new, vendors (×2)
- 2x `react/no-unescaped-entities` — `&apos;` in DigestView.tsx, `&ldquo;/&rdquo;` in DocumentVaultView.tsx
- 1x `react-hooks/set-state-in-effect` — moved `setMergePreview(null)` inside debounce callback in AddItemForm.tsx
- 1x `prefer-const` — `let text` → `const text` in strip-descriptors.ts

All 3 gates: PASSED.

---

## Cleanup commits

| Commit | Description |
|--------|-------------|
| 45b6dba | chore(v34): actually remove family-school-brief skill (cleanup of P0) |
| 7745014 | docs(v34): document legitimate test skips for T6 and T8 stub skills |
| 48a61f1 | fix(v34): regenerate Supabase types + resolve v33 dedup TS errors (partial) |
| 546e330 | fix(v34): regenerate Supabase types + resolve v33 dedup TS errors (complete) |
| d881814 | fix(v34): fix 11 lint errors — Link, unescaped entities, prefer-const, setState in effect |

---

## PR Ready for Fernando

Branch: `feat/v34-session-b-features-batch` → `main`
Title: `v34.0.0: Session B — 8 features activated, hallucination-guarded skills, mega-menu nav`

Create at: https://github.com/zevallos-fg/family-coordinator/compare/main...feat/v34-session-b-features-batch

### PR body:

```
## Summary

- 8 new features: Vendors, Trips, Hurricane Prep, Kid Milestones, Kid Birthdays, Expenses, Document Vault, Weekly Digest
- 9 new skills (all Haiku tier, Zod-validated, min 4 few-shot examples, hallucination-guarded)
- Mega-menu navigation updated (TopNav + MobileNav)
- Pre-merge cleanup: school-brief actually deleted, TS errors resolved, lint clean, storage migration applied

## Features (8/8)

| Feature | Route(s) | Skill(s) | Tests |
|---------|----------|----------|-------|
| F1: Vendors | /vendors, /vendors/[id] | family-vendor-memory | 6 unit |
| F2: Trips | /trips, /trips/[id] | family-travel | 6 unit |
| F3: Hurricane Prep | /hurricane | family-hurricane-prep | 7 unit |
| F4: Kid Milestones | /kids, /kids/[id]/milestones, /kids/[id]/medical | family-kid-milestone | 6 unit |
| F5: Kid Birthdays | /kids/birthdays | family-birthday-social | 6 unit |
| F6: Expenses | /expenses, /expenses/reimbursements | family-expense-parser | 6 unit |
| F7: Document Vault | /documents, /documents/[id] | family-document-indexer, family-document-qa | 12 unit |
| F8: Weekly Digest | /digest | family-weekly-digest | 6 unit |

## Cross-cutting

- ActionResult<T> — lib/skill-action-result.ts
- withRetry — lib/with-retry.ts (1s/3s/9s exponential backoff)
- Hallucination guards — lib/hallucination-guards.ts
- UI primitives — ErrorBanner, EmptyState, LoadingState
- Mega-menu nav — TopNav.tsx + MobileNav.tsx updated

## Tests

```
Test Files  25 passed | 2 skipped (27)
Tests  177 passed | 2 skipped (179)
```
2 skips are legitimate stub skills (T6, T8) documented in TECH_DEBT.md.

## TypeScript

`npx tsc --noEmit` exits 0. database.types.ts regenerated from live Supabase.

## Storage

`supabase/migrations/20260425_v34_family_documents_bucket.sql` applied to pmficrajnyeuworrqytn.
Bucket family-documents verified: public=false, 26MB limit, 4 RLS policies.

## Post-build cleanup

1. family-school-brief actually removed from git (45b6dba) — P0 only ran rm -rf without git rm
2. Test skips documented (7745014) — 2 legitimate stubs with SKIP-REASON comments
3. TS errors fixed (546e330) — types regenerated, updateGroceryStore added, nullable uuid cast fixed
4. Lint fixed (d881814) — 11 errors: Link/a, unescaped entities, prefer-const, setState in effect

## Evidence

Full gate evidence: docs/v34-evidence/cleanup.md

## Post-merge expectations

- /documents upload requires family-documents bucket (already applied)
- All 8 features accessible via mega-menu
- Haiku skills require ANTHROPIC_API_KEY in production env
```
