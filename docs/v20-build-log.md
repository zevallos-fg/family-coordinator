# v20 Build Log

## 2026-04-18T18:30:00Z — §1 Ground Truth Verified
All 4 files confirmed: index.html (76KB), worker/src/index.js, apps-script/Code.gs (3.5KB), Family-Coordinator-BRD-v20.md (23KB).
Worker: simple passthrough proxy to Anthropic API. No routing. CORS wildcard.
Apps Script: JSON-blob-per-cell storage for 5 v8.4 sheets. Dead `action === "anthropic"` branch present (to be removed).
Decision: autonomous (§0a)
---

## 2026-04-18T18:30:01Z — §2b Haiku Eval Result Applied
Score: 16/20 — FAIL (threshold 18/20).
Failures: 4 ambiguous inputs — 2 Haiku prose-append (app crash), 2 classification divergence.
Decision: §0b rule 1 fallback applied. Sonnet retained for grocery parser. Haiku assigned to all new v20 endpoints.
Details: eval/haiku-migration-20260418.md
---

## 2026-04-18T18:30:02Z — §2d appsscript.json was 0 bytes
Writing safe default per §0b rule 2.
Decision: autonomous (§0b rule 2)
---

## 2026-04-18T18:30:03Z — §2c USDA FDC Key
Adding placeholder comment to wrangler.toml. Lookup chain will skip USDA. Handoff item added.
Decision: autonomous (§0b rule 12)
---

## 2026-04-18T18:30:04Z — §3 Scope Confirmed
Active sheets (7): Recipes, Ingredients, RecipeIngredients, MealPlanSlots, Pantry, ReceiptImports, Family.
Stub sheets (6): Tasks, Digests, Documents, Maintenance, MealLog, PersonNutritionTarget.
Extended: Grocery (add quantity, unit, pantryBacked, ingredientId).
New file: family-coordinator-v20.html. index.html preserved unchanged.
New tabs: Overview (default), Meal Plan, Pantry. Preserved: Schedule, Dump, Organized, Grocery.
---

## 2026-04-18T18:30:05Z — §4 Schema Design
13 v20 sheets with row-per-record format (headers in row 1, data in subsequent rows).
Grocery sheet extended with 4 nullable columns (non-destructive).
Decision: row-per-record chosen over JSON-blob for v20 sheets per BRD relational schema.
---

## 2026-04-18T18:30:06Z — §5 Worker Extended
Added 7 routing paths + named prompt consts. Kept root POST / as legacy passthrough for v8.4 compat.
CORS locked to github.io origin (v20). Legacy wildcard preserved for root path.
Input size limit: 4MB images enforced.
Models: Haiku default for all new endpoints per §2b decision.
---

## 2026-04-18T18:30:07Z — §6+§7 Apps Script Extended
Added: initV20Sheets (idempotent), ensureDragnetFolder, weeklyBackup, uploadBinary, installWeeklyBackupTrigger.
Extended: doGet supports ?sheet=X for row-per-record reads. doPost supports {action,sheet,row,rowId}.
Removed dead action==="anthropic" branch.
Family seeded: Fernando (parent), Yenny (parent), Leo (child).
---

## 2026-04-18T21:00:00Z — §8-§17 Frontend Build (8 commits)
family-coordinator-v20.html: 7 tabs, mobile-first bottom nav, all flows implemented.
Overview: read-only week summary, day cards, grocery count.
Meal Plan: 4x7 grid, rotation strip, slot assignment, cooked/skipped status.
Recipe Detail: ingredient scaling, pantry indicators, notes append.
Add Recipe: URL (JSON-LD free path + Haiku fallback), image upload, manual entry.
Pantry: searchable table, needs-review indicators, all 4 add methods.
Barcode: ZXing primary, BarcodeDetector fallback, Open Food Facts → USDA skip → Haiku vision.
Receipt: photo (Publix) + email paste (Whole Foods).
Grocery Extended: projection from meal plan, pantry suppression, preferredStore learning.
Rotation Engine: computed at render per BRD §5.7 thresholds.
---

## 2026-04-18T18:45:00Z — §19 Dependency Audit
ZXing-js @latest: MIT license, ~180KB UMD, last release within 6 months. APPROVED per §0b rule 20.
CDN primary: unpkg.com. Fallback: jsdelivr.net. Both in §25 allowlist.
---

## 2026-04-18T21:00:01Z — §20 Worker Deploy
wrangler deploy succeeded. Version: 46b88c85. URL: https://aged-dust-551a.zevallos-fg.workers.dev
Smoke test: /parse-grocery → {isGrocery:true, items:["milk","eggs"]} ✅
---

## 2026-04-18T21:00:02Z — §21 Automated Tests
11/11 PASS. See HANDOFF.md for full scorecard.
Decision: autonomous (§0b rule 14)
---

## 2026-04-18T21:00:03Z — §22 Handoff Complete
HANDOFF.md, TECH_DEBT.md, CHANGELOG.md written. Final commit + push.
---

## 2026-04-18T21:00:04Z — BUILD COMPLETE
Status: SUCCESS
See HANDOFF.md for manual follow-up steps. Rollback available — v8.4 still live at index.html.
---
