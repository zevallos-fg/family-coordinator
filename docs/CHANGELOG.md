# Changelog — Family Coordinator

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
