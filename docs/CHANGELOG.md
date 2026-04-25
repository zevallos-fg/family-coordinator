# Changelog — Family Coordinator

## [34.0.0] — 2026-04-25

**Session B: 8 schema-and-skill features activated. Mega-menu nav. Hallucination guards on three skills.**

### Cross-cutting
- `ActionResult<T>` type, `withRetry` helper (1s/3s/9s exponential backoff), `ErrorBanner`/`EmptyState`/`LoadingState` UI primitives
- Hallucination guards library (`verifyEntitiesExist`, `verifySubstringInCorpus`, `extractDates`, `extractAmounts`)
- Mega-menu nav with Receipts demoted to More dropdown; mobile flat list with all 16 destinations
- `lib/supabase/database.types.ts` fixed (stray SQL prefix removed)

### Features shipped
- **F1: Vendors** — CRUD + service log + AI memory search (vendor-memory skill)
- **F2: Trips** — trip planner + AI packing list + prep tasks (travel skill)
- **F3: Hurricane Prep** — season-phase checklist + named-storm/cross-region hallucination guards
- **F4: Kid Milestones** — milestone logger (AI analyze→review→save) + medical CRUD (no AI)
- **F5: Kid Birthday Events** — party tracker + on-demand gift suggestions
- **F6: Expenses + Reimbursements** — text-parse + manual entry + reimbursement flow
- **F7: Document Vault** — upload + vision indexing + verbatim-passage QA search
- **F8: Weekly Digest** — 9-source composition + blind spots + convert-to-task

### Skills (9 total)
- `family-vendor-memory` — vendor relevance matching with hallucination guard
- `family-travel` — packing list + prep tasks with owner validation
- `family-hurricane-prep` — Miami seasonal prep with named-storm ban (hallucination guard)
- `family-kid-milestone` — developmental milestone analysis with safety disclaimers
- `family-birthday-social` — gift suggestions + reciprocity check
- `family-expense-parser` — amount/merchant extraction with numeric guard
- `family-document-indexer` — vision-capable OCR + metadata extraction
- `family-document-qa` — verbatim-passage semantic search (hallucination guard)
- `family-weekly-digest` — composition skill with entity guard (verifyEntitiesExist)
- `family-school-brief` — **removed** in P0

### Storage
- `family-documents` Storage bucket created with RLS policies (migration 20260425)

### Database
- Zero new schema migrations (all schemas pre-existed)

### Tests
- 9 new skill test suites — 57 total new tests
- 8 new E2E specs (vendors, trips, hurricane, kids, expenses, digest, and more)
- Hallucination guards tested on: hurricane-prep, document-indexer, document-qa, weekly-digest, expense-parser, travel, vendor-memory

## v20 — 2026-04-18

**Second-brain reframe anchored on meal planning.**

### Concept shift
v8.4 was a household coordination tool. v20 is a family second brain. The anchor use case is meal planning: capture → structure → compress → rotate → decide. Future domains (finance, health, projects) extend the same pattern.

### New sheets (active)
- `Recipes` — canonical recipe entity with rotation metadata, notes log, dragnet storage
- `Ingredients` — canonical ingredient with nutrition (USDA FDC IDs, Open Food Facts barcodes)
- `RecipeIngredients` — join table with quantity/unit/preparation, enables scaling
- `MealPlanSlots` — 4×7 weekly grid (Breakfast/Lunch/Dinner/Snack × Mon–Sun)
- `Pantry` — inventory with addedVia provenance, expiry dates, auto-deduct on cook
- `ReceiptImports` — receipt audit log with raw + parsed JSON (dragnet)
- `Family` — Fernando, Yenny, Leo seeded

### New sheets (stubs — schema only, no UX)
- `Tasks`, `Digests`, `Documents`, `Maintenance`, `MealLog`, `PersonNutritionTarget`

### Extended sheets
- `Groceries` — new columns: `quantity`, `unit`, `pantryBacked`, `ingredientId`

### New file
- `family-coordinator-v20.html` — 153KB single-file React app, same CDN pattern as v8.4

### New tabs
- **Overview** (default) — read-only week-at-a-glance: 7 day cards, Leo duties, dinner preview, grocery bar, urgent alert
- **Meal Plan** — 4×7 grid, rotation suggestion strip, slot picker, mark cooked, grocery projection
- **Pantry** — searchable inventory, 4 add methods (manual/barcode/photo receipt/email receipt), expiry alerts, needs-review indicators

### New modals
- Recipe Detail — servings stepper with live scaling, pantry indicators, notes log
- Add Recipe — URL (JSON-LD free → Haiku fallback), image upload (Haiku vision), manual form
- Barcode Scanner — ZXing + Open Food Facts lookup
- Receipt Capture — Haiku vision (photo) + email paste

### Grocery tab extended
- Pantry suppression (items with sufficient pantry qty collapse into "you're good on" section)
- "Buy anyway" override
- Completion → Pantry row auto-written
- preferredStore learning (3 consecutive same-store → set on ingredient)
- Legacy row promote (link v8.4 rows to v20 ingredients)

### Cloudflare Worker
- v20 routing: 7 named endpoints
- `POST /parse-grocery` (Sonnet, retained from eval)
- `POST /extract-recipe-url`, `/extract-recipe-image`, `/extract-barcode-wrapper` (Haiku)
- `POST /parse-receipt-photo`, `/parse-receipt-email` (Haiku)
- `POST /fetch-html` (CORS proxy, domain allowlisted)
- `POST /` legacy passthrough (v8.4 backward compat)
- `extractJSON()` guards against Haiku prose-append bug found in eval

### Apps Script
- `initV20Sheets()` — idempotent, creates 13 sheets, seeds Family
- `ensureDragnetFolder()` — Drive: Family-Coordinator-Dragnet/{recipes,receipts,backups}
- `weeklyBackup()` — Sunday 11pm ET, all sheets → CSV + JSON to Drive
- `uploadBinary()` — base64 → Drive with folder routing
- Extended `doGet` (`?sheet=X` row-per-record reads) and `doPost` (action/sheet/row/rowId writes)
- Dead `action==="anthropic"` branch removed

### Model strategy
- Haiku eval: 16/20 — FAIL (threshold 18/20). See `eval/haiku-migration-20260418.md`.
- Grocery parser: Sonnet 4 retained (ambiguous inputs produced app-crashing prose in Haiku)
- All new endpoints: Haiku 4.5 (recipe, receipt, barcode vision)
- Schedule analysis: Sonnet 4 (reasoning-heavy, unchanged)

### Preserved unchanged
- `index.html` (v8.4 — rollback target)
- Schedule tab, Mental Dump tab, Organized tab, Grocery tab (v8.4 logic)
- GOOGLE_SCRIPT_URL, WORKER_URL, SYNC_INTERVAL

---

## v8.4 — March 2026
Grocery Intelligence baseline — AI routing, per-item store assignment, custom stores, v8.4 multi-tab shell.

## v8.0 → v8.3 — March 2026
Schedule analysis with vision, Mental Dump with AI routing, Organized categories.
