# Tech Debt — Family Coordinator
*Rewritten for v33.0.0 Next.js codebase baseline | 2026-04-25*
*"No bandaid solutions. Proper infrastructure from the start; tech debt tracked here rather than accumulated silently."*

---

## §1 Deferred from v33 Session A

### Rotation chip UI
`recipes.rotation_status` column exists (`fresh | cooling | stale`). No UI surfaces or updates this value. Deferred until meal-logging feedback loop exists.

### Pantry deduction trigger
When `meal_plan_entries.cooked_status` flips to `cooked`, the pantry should auto-decrement used ingredients. Logic not implemented. Columns exist; trigger pending dedicated session.

### Calorie / nutrition tracking UX
`meal_log` + `person_nutrition_targets` stub tables created in v33 migration. No UI exists.

### Resolution log review surface
`ingredient_resolution_log` collects every Tier-3 resolver call. No in-app UI to review or promote Tier-3 suggestions. `grocery_backfill_review` view exists for DB-level review.

### `ingredient_aliases` table
Deferred until ≥100 Tier-3 entries accumulate in `ingredient_resolution_log`. Do not build ahead of corpus signal.

### `grocery_items.quantity` legacy text column deprecation
Kept in v33 for rollback safety alongside new `qty_value numeric + qty_unit text`. Remove in v34 or v35 after confirming all read paths migrated.

### Universal physics unit conversion in `addGroceryItem`
`fn_grocery_upsert` currently clusters different-unit quantities for review. True cross-unit merging (cup↔ml, lb↔g) requires a conversion layer before calling the PG function. Build when `requires_review` queue has enough patterns.

---

## §2 Orphan skills awaiting decision (decide in v34)

### `family-school-brief`
Skill file exists. No schema. No UX. Options: build out (school newsletters → action items) or kill. Decide v34.

### `family-blind-spot-detector`
Skill file exists. No schema. No UX. Options: integrate into Weekly Digest or kill. Decide v34.

---

## §3 Schema-and-skill UX activations queued for Session B

| Feature | Note |
|---|---|
| **Vendors** | Full CRUD vendor list + service log. Schema + skill exist. |
| **Trips** | Trip + packing list via family-travel skill. Schema + skill exist. |
| **Hurricane / Seasonal Prep** | Checklist generation via family-hurricane-prep. Schema + skill exist. |
| **Kid Milestones + Birthdays** | Milestone logging + gift suggestions. Schema + skills exist. |
| **Expenses / Reimbursements** | Expense capture + reimbursement tracking. Schema + skill exist. |
| **Document Vault** | Upload, index, Q&A via document-indexer + document-qa. Schema + skills exist. |
| **Weekly Digest** | AI family brief. Skill + actions exist. |

---

## §4 Known issues surfaced during v33 build

### Playwright E2E requires authenticated session
All E2E specs navigating to `/grocery`, `/meal-plans` redirect to `/login` without auth. Set up Playwright `storageState` auth fixture before v35 E2E expansion.

### `vi.hoisted` requirement for integration tests
Vitest mocking of `server-only` modules requires `vi.hoisted` declarations. Follow pattern in `tests/integration/grocery-dedup.test.ts` for all future integration tests.

---

## §5 Out-of-scope reminders

- **Budgeting replacement** — not Monarch/YNAB. Transaction categorization out of scope.
- **Messaging replacement** — not a group chat platform.
- **Clinical / diagnostic features** — no HIPAA-sensitive data or medication management.
- **School portal replacement** — we ingest, we don't replicate the school portal.
