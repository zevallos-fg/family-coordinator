# Family Coordinator v20 — Autonomous Build Prompt

**Audience:** Claude Code, running locally in the `family-coordinator` repo.
**Mode:** **HANDS-OFF.** Fernando is not supervising. Every decision has a pre-determined default (§0b). Halt only on the conditions in §25. Everything else: log, retry once, continue.
**Goal:** Ship v20 end-to-end. v20 = second-brain reframe anchored on meal planning, built on top of the live v8.4 system without breaking it.
**Budget:** Claude API ≤ $5/month. Hosting: zero ongoing cost.
**Principle:** Proper infrastructure from the start. No shortcuts. If uncertain, read source before writing.

---

## §0. Skill Invocation Plan

Invoke the right specialized skill per section. Each section below starts with a `Skills:` header. Trigger pattern: `Using [skill-name] skill, [request]`.

| § | Work | Primary Skill | Supporting Skills |
|---|---|---|---|
| 1 | Ground-truth read | `codebase-onboarding` | — |
| 2 | Pre-flight (Haiku eval, keys, Drive) | `senior-prompt-engineer` | `senior-qa`, `env-secrets-manager`, `senior-backend` |
| 4 | Schema design | `database-designer` | `senior-architect`, `migration-architect` |
| 5 | Cloudflare Worker endpoints | `senior-backend` | `api-design-reviewer`, `senior-secops`, `senior-prompt-engineer` |
| 6 | Apps Script extensions | `senior-backend` | `migration-architect`, `senior-data-engineer` |
| 7 | Drive layout + backup | `senior-data-engineer` | — |
| 8 | Frontend shell, mobile nav | `senior-frontend` | `frontend-design` |
| 9 | Overview tab | `senior-frontend` | `frontend-design`, `ui-ux-pro-max` |
| 10 | Meal Plan tab | `senior-frontend` | `frontend-design`, `ui-ux-pro-max` |
| 11 | Recipe Detail modal | `senior-frontend` | `frontend-design` |
| 12 | Add Recipe flows | `senior-fullstack` | `senior-prompt-engineer`, `frontend-design` |
| 13 | Pantry tab | `senior-frontend` | `frontend-design` |
| 14 | Barcode scan flow | `senior-fullstack` | `senior-prompt-engineer`, `dependency-auditor` |
| 15 | Receipt capture flow | `senior-fullstack` | `senior-prompt-engineer` |
| 16 | Grocery extended | `senior-frontend` | — |
| 17 | Rotation engine | `senior-frontend` | — |
| 18 | Model strategy | `senior-prompt-engineer` | — |
| 19 | Dependency audit | `dependency-auditor` | — |
| 20 | Deploy sequence | `senior-devops` | `release-manager`, `env-secrets-manager` |
| 21 | Self-test (automated) | `senior-qa` | `code-reviewer` |
| 22 | Autonomous handoff | `pr-review-expert` | `code-reviewer`, `tech-debt-tracker`, `changelog-generator` |

**Rule:** Do not start a section until the named Primary skill has been invoked.

---

## §0a. Autonomy Directive (READ BEFORE EVERYTHING)

Fernando is asleep / unavailable. Proceed through the entire build autonomously. Do not ask questions. Do not pause for confirmation. Make decisions per §0b defaults. Log everything to `./v20-build-log.md` (append-only, ISO timestamps).

### §0a.1. Session log format
Create `./v20-build-log.md` at session start if it doesn't exist. Every notable action appends:
```
## 2026-04-18T22:47:03Z — §2b Haiku eval
Result: 19/20 parity. Haiku committed as default.
Details: eval/haiku-migration-20260418.md
Decision: autonomous (per §0b rule 1)
---
```
Log entries: section header, action, result, any autonomous decision taken, pointer to artifacts. Every major step writes at least one entry. If something surprising happens, log it even if you handled it autonomously.

### §0a.2. Soft failures (log + continue)
For ANY non-critical error:
1. Log the error + what you tried to `./v20-build-log.md`
2. Retry once
3. If still failing, apply fallback per §0b or §24
4. Continue building
5. Flag in handoff §22

### §0a.3. Hard failures (halt only per §25)
Only the conditions listed in §25 stop the build. Everything else is recoverable.

### §0a.4. Commit discipline
After every major section completes, commit with a descriptive message. Push to `origin/main` at end of §22 (not before). Keep commits atomic per section so Fernando can revert individual features if needed.

### §0a.5. What "done" means
Build is done when: all sections §1–§22 processed, `./HANDOFF.md` written with full status, `./v20-build-log.md` committed, pushed to GitHub. Final terminal message: `v20 build complete. See HANDOFF.md.` Exit.

---

## §0b. Pre-Determined Decisions (NO QUESTIONS)

Every fork has a default. Take the default. Log the choice.

| # | Decision Point | Default | Fallback |
|---|---|---|---|
| 1 | Haiku eval parity ≥18/20? | Commit Haiku as default for ALL endpoints | <18 → Haiku for new endpoints only; Sonnet retained for grocery parser |
| 2 | `appsscript.json` empty/0 bytes? | Write safe default per §2d2 | — |
| 3 | Worker `--from-dash` pull fails | Worker source already in repo at `worker/src/index.js`; use it directly | — |
| 4 | `wrangler deploy` fails (transient) | Retry once after 30s | Second fail → log + skip deploy; ship code-only, Fernando deploys manually (handoff note) |
| 5 | ZXing CDN URL 404 | Try `https://cdn.jsdelivr.net/npm/@zxing/library@latest/umd/index.min.js` | Still fail → fall back to BarcodeDetector-only (log Safari caveat in handoff) |
| 6 | Open Food Facts API rate-limited | Wait 5s, retry once | Still failing → skip to USDA then Haiku vision in lookup chain |
| 7 | Recipe URL page has no JSON-LD | Proceed to Haiku extraction immediately — don't log this as a problem | — |
| 8 | Haiku returns malformed JSON | Retry once with `response_format` hint | Still malformed → save raw response to Recipe row, flag `parseStatus: "needs_review"`, continue |
| 9 | Receipt line item <80% fuzzy match | Write to `ReceiptImports.parsedJSON` with `matchStatus: "unmatched"`, do NOT auto-write Pantry row | Handoff: Fernando reviews unmatched items in Receipt tab (not built tonight — log as visible in debug panel) |
| 10 | Ingredient not found by barcode in any source | Write `Ingredients` row with `canonicalName = "Unknown ({barcode})"`, `nutritionPer100g = {}`, flag `needsReview: true` | Handoff: Fernando edits in ingredients CRUD (not built tonight — log this gap) |
| 11 | Sheet `initV20Sheets()` push fails | Stage Apps Script file locally, write run-this-manually instructions to HANDOFF.md (Fernando has no clasp per security decision) | — |
| 12 | USDA FDC key still placeholder | Skip USDA step in barcode lookup chain (per §2c logic); log as pending user action | Handoff item |
| 13 | Git push fails (auth) | Retry once. Second fail → commit is local only; write manual push instructions to HANDOFF.md | — |
| 14 | Automated test in §21 fails | Retry once. Second fail → log diagnosis + continue. Flag ❌ in §22 handoff. | Only HALT if it's a §25 condition |
| 15 | Mobile viewport test unverifiable programmatically | Write viewport-test results by parsing CSS / inspecting React render; flag as manual-verify in HANDOFF.md | — |
| 16 | Any UI visual quality test | Use screenshot + heuristic where possible; flag manual in HANDOFF.md otherwise | — |
| 17 | Ambiguity in schema | BRD §X is authoritative — pick BRD interpretation | Still ambiguous → pick simplest schema, flag in tech debt |
| 18 | Ambiguity in UX | Fewer taps wins | — |
| 19 | Ambiguity in tech choice | Zero-cost option wins | — |
| 20 | Dependency audit reveals issue | If MIT/Apache/BSD + <250KB + maintained within 6mo → approve. Otherwise → substitute or skip feature (log) | — |

---

## §1. Ground Truth — Read Before Writing Any Code

**Skills: `codebase-onboarding` (primary)**

Invoke `codebase-onboarding`. Read these files in order:

1. `./index.html` — v8.4 production build. **Preserve unchanged. Rollback target.**
2. `./worker/src/index.js` — Cloudflare Worker source. Clean passthrough wrapping Anthropic API with CORS.
3. `./apps-script/Code.gs` — Apps Script attached to Sheet ID `1KKFGtWQBedwGpFQHu9hctkoTrKmq9DrHWQMAB6uU6eE`. Contains a dead-code `action === "anthropic"` path in `doPost` that can be ignored (legacy; not called by v8.4 frontend).
4. `./Family-Coordinator-BRD-v20.md` — authoritative spec.

**§25 halt condition:** If any of the 4 files is missing, write `./HALT.md` with the missing file name + timestamp, commit, push, exit. Do not proceed.

If all 4 present, log `§1 ground truth satisfied` to build log, proceed.

---

## §2. Pre-Flight

**Skills: `senior-prompt-engineer` (primary), `senior-qa`, `env-secrets-manager`, `senior-backend`**

### §2a. File presence check
```bash
ls -la index.html worker/ apps-script/ Family-Coordinator-BRD-v20.md
```
Halt per §25 if any missing.

### §2b. Haiku migration eval
Invoke `senior-prompt-engineer` + `senior-qa`.

1. Extract `parseGroceryIntent` prompt from `index.html` (~lines 58–100).
2. `senior-qa` constructs 20 inputs: 6 clear groceries, 6 clear non-groceries, 4 ambiguous, 4 multi-intent.
3. Run each through Worker twice: `claude-sonnet-4-20250514` and `claude-haiku-4-5-20251001`.
4. Compare. Parity threshold **≥18/20**.
5. **Autonomous decision per §0b rule 1.** No user confirmation.
6. Write `./eval/haiku-migration-$(date +%Y%m%d).md` with inputs, outputs, score, decision.
7. Commit: `eval: haiku migration (score X/20, decision)`.
8. Log to `./v20-build-log.md`.

### §2c. USDA FDC key handling
`env-secrets-manager`. In `worker/src/index.js`:
```js
const USDA_FDC_KEY = env.USDA_FDC_KEY || "TODO_REGISTER_AT_https://fdc.nal.usda.gov/api-key-signup.html";
```
If placeholder, lookup chain skips USDA. **Do not halt** — default per §0b rule 12.
Add to `wrangler.toml`:
```toml
[vars]
# USDA_FDC_KEY registered as secret via `wrangler secret put` once Fernando registers
```
Handoff item: Fernando registers + `wrangler secret put USDA_FDC_KEY`.

### §2d. Apps Script `appsscript.json` check
```bash
wc -c apps-script/appsscript.json
```
If size = 0 bytes (per §0b rule 2), write safe default:
```json
{
  "timeZone": "America/New_York",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```
Log the choice. Fernando verifies on Apps Script editor manually during handoff.

### §2e. Drive folder auto-create
Add `ensureDragnetFolder()` to `apps-script/Code.gs` per §6. Creates `Family-Coordinator-Dragnet/{recipes,receipts,backups}/`. Idempotent.

Commit: `pre-flight: haiku eval, usda placeholder, appsscript manifest`.

---

## §3. Scope

**Skills: `release-manager` (advisory)**

### §3a. Sheets — active (7)
`Recipes`, `Ingredients`, `RecipeIngredients`, `MealPlanSlots`, `Pantry`, `ReceiptImports`, `Family` (seed Fernando/Yenny/Leo, all fields except `name` nullable).

### §3b. Sheets — stub (6, headers only)
`Tasks`, `Digests`, `Documents`, `Maintenance`, `MealLog`, `PersonNutritionTarget`.

### §3c. Extended
`Grocery` — add nullable columns `quantity`, `unit`, `pantryBacked`, `ingredientId`.

### §3d. New file
`./family-coordinator-v20.html` — single-file React, same CDN pattern as v8.4. Do NOT modify `./index.html`.

### §3e. New tabs
Overview (default), Meal Plan, Pantry.

### §3f. Preserved (unchanged)
Schedule, Dump, Organized, Grocery.

### §3g. Out of scope
Tasks/Digests/Documents/Maintenance/MealLog/PersonNutritionTarget UX, calorie tracking, per-step recipe timing, voice recipe capture, Costco PDF receipts, pregnancy-stage filters, native mobile, external calendar sync, extended family sharing, 3-layer wiki classifier.

---

## §4. Schemas

**Skills: `database-designer` (primary), `senior-architect`, `migration-architect`**

### §4a. Recipes
```
recipeId (uuid) | name | sourceUrl (nullable) | sourceImage (Drive file ID, nullable) | baseServings (int, default 4) | methodSteps (prose) | totalTimeMin (int, nullable) | dietaryTags (pipe-separated) | cuisine (nullable) | createdBy (Fernando|Yenny) | createdAt (ISO) | timesCooked (int, default 0) | lastCookedAt (ISO, nullable) | rotationStatus (computed at read) | notes (newline-separated append-only) | parseStatus (ok|needs_review) | rawSource (JSON: {html, parsed})
```

### §4b. Ingredients
```
ingredientId (uuid) | canonicalName | usdaFdcId (nullable) | openFoodFactsBarcode (nullable) | density_g_per_ml (float, nullable) | nutritionPer100g (JSON) | preferredStore (nullable) | needsReview (bool, default false) | lastUpdated (ISO)
```
nutritionPer100g minimum keys: `kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg, iron_mg, folate_ug, calcium_mg`.

### §4c. RecipeIngredients
```
recipeIngredientId (uuid) | recipeId (fk) | ingredientId (fk) | quantity (float) | unit (enum) | preparation (nullable) | isOptional (bool)
```
Unit enum: `g, kg, ml, l, tsp, tbsp, cup, fl_oz, oz, lb, piece, pinch, to_taste`.

### §4d. MealPlanSlots
```
slotId (uuid) | weekOf (ISO week) | dayOfWeek (Mon..Sun) | slot (Breakfast|Lunch|Dinner|Snack) | recipeId (fk, nullable) | servingsPlanned (int, nullable) | noteFreeText (nullable) | cookBy (Fernando|Yenny|Both, nullable) | cookedStatus (planned|cooked|skipped, default planned)
```

### §4e. Pantry
```
pantryId (uuid) | ingredientId (fk) | quantity (float) | unit (enum) | addedAt (ISO) | addedVia (manual|receipt_digital|receipt_photo|grocery_completion|barcode_scan) | expiryDate (nullable)
```

### §4f. ReceiptImports
```
receiptId (uuid) | source (whole_foods_email|publix_photo|other) | rawContent | parsedJSON | lineItemCount | matchedCount | matchStatus (ok|partial|unmatched) | importedAt | importedBy
```

### §4g. Family
```
personId (uuid) | name | role (parent|child) | birthDate (nullable) | dietaryRestrictions (nullable) | nutritionTargetId (nullable) | createdAt
```
Seed: Fernando, Yenny, Leo — name only.

### §4h. Stubs
```
Tasks: taskId | title | ownerId | dueDate | status | createdAt | completedAt
Digests: digestId | weekOf | generatedAt | summary
Documents: documentId | name | category | driveFileId | uploadedBy | uploadedAt
Maintenance: maintenanceId | item | cadenceDays | lastDoneAt | nextDueAt | notes
MealLog: logId | date | slot | recipeId | ingredientId | servingsConsumed | personId | loggedAt
PersonNutritionTarget: targetId | personId | startDate | dailyKcalTarget | macroSplitJSON | micronutrientTargetsJSON | notes
```

### §4i. Grocery extended
Add nullable: `quantity`, `unit`, `pantryBacked`, `ingredientId`.

### §4j. Dietary tags seed
`pregnancy-safe, iron-rich, folate-rich, high-protein, postpartum-comfort, toddler-friendly, vegetarian, gluten-free, dairy-free, quick-30min, batch-friendly, nut-free, spicy`

Commit: `schema: v20 data model — 7 active, 6 stub sheets, grocery extended`.

---

## §5. Cloudflare Worker — Extend

**Skills: `senior-backend` (primary), `api-design-reviewer`, `senior-secops`, `senior-prompt-engineer`**

### §5a. Endpoints
- `POST /parse-grocery` (existing) — update default model per §2b.
- `POST /extract-recipe-url` — new. `{html}` → canonical recipe JSON.
- `POST /extract-recipe-image` — new. `{imageBase64, mimeType}` → canonical recipe JSON (vision).
- `POST /extract-barcode-wrapper` — new. `{imageBase64, mimeType}` → `{productName, brand, nutritionPer100g, barcode?}` (vision, last-resort).
- `POST /parse-receipt-photo` — new. `{imageBase64, mimeType}` → `{lineItems: [{name, quantity, unit, price}]}` (vision).
- `POST /parse-receipt-email` — new. `{html}` or `{text}` → same shape.
- `POST /fetch-html` — new (only if client-side CORS blocks recipe URL fetch). Allowlist common recipe domains.

### §5b. Universal
- Optional `model` param. Default `claude-haiku-4-5-20251001`.
- CORS: `Access-Control-Allow-Origin: https://zevallos-fg.github.io`. Keep wildcard only if existing Worker does.
- Max tokens: 2000 default, 4000 for recipe extraction, 1000 for grocery.
- Error: `{error, detail}` with 4xx/5xx.
- No image payloads in logs. No raw retention post-response.
- Input size limit: 4MB images (senior-secops enforces).

### §5c. Prompt library
`senior-prompt-engineer` writes each as a named const at top of `index.js`. All return strict JSON. Include "Return ONLY valid JSON. No markdown. No prose." Handle parse failure per §0b rule 8.

### §5d. Secrets
`ANTHROPIC_KEY` (set). `USDA_FDC_KEY` (placeholder — handoff item).

### §5e. Deploy
```bash
cd worker
wrangler deploy
```
Fail → retry once → per §0b rule 4.

Commit: `worker: v20 endpoints (recipe, barcode, receipt)`.

---

## §6. Apps Script — Extend

**Skills: `senior-backend` (primary), `migration-architect`, `senior-data-engineer`**

**Note:** Fernando has no clasp (security decision). Apps Script changes are local-only; push is manual (handoff item).

### §6a. Functions
- `doGet(e)` — extend: `?sheet=<name>` returns all rows as JSON. Support all 13 new sheets + existing.
- `doPost(e)` — extend: `{action, sheet, row, rowId?}` with actions `append|update|delete`. Remove the dead `action === "anthropic"` branch (no longer needed post-rotation).
- `initV20Sheets()` — new, idempotent. Creates 13 new sheets + headers. Seeds Family (Fernando, Yenny, Leo, names only). `migration-architect` ensures idempotency.
- `ensureDragnetFolder()` — creates `Family-Coordinator-Dragnet/{recipes,receipts,backups}/`, caches ID in Script Properties.
- `weeklyBackup()` — dumps all sheets as CSV + `all-sheets.json` to `backups/YYYY-MM-DD/`. `senior-data-engineer` implements.
- `uploadBinary({name, mimeType, base64, folder})` — writes to Drive, returns file ID.
- `installWeeklyBackupTrigger()` — installs Sunday 11pm ET trigger, idempotent.

### §6b. Contract
- Read by sheet name always.
- Timestamps ISO 8601 UTC.
- Errors: HTTP 500 + `{error, detail}`.

### §6c. Autonomous handoff
After writing updated `apps-script/Code.gs`:
1. Commit: `apps-script: v20 extensions (ready for manual paste)`
2. Add to HANDOFF.md:
   - "Open Apps Script editor at the Sheet"
   - "Copy contents of `apps-script/Code.gs` → paste into editor → save (Ctrl+S)"
   - "Run `initV20Sheets()` once manually from the editor (dropdown → select function → Run)"
   - "Confirm 13 new sheets created + Family seeded"
   - "Run `installWeeklyBackupTrigger()` once"

---

## §7. Drive Layout

**Skills: `senior-data-engineer` (primary)**

```
Family-Coordinator-Dragnet/
├── recipes/
├── receipts/
└── backups/
    └── YYYY-MM-DD/
        ├── Schedule.csv ... (all 13+ sheets)
        └── all-sheets.json
```

---

## §8. Frontend Shell

**Skills: `senior-frontend` (primary), `frontend-design`**

### §8a. File
`./family-coordinator-v20.html` — single-file React, CDN deps matching v8.4.

### §8b. Header
Badge: `v20`. No visible cost counter. `?debug=1` shows schema version, last sync, cost estimate, unmatched-item counts.

### §8c. Tab order (Overview default)
`Overview · Meal Plan · Schedule · Dump · Organized · Grocery · Pantry`

### §8d. Mobile nav
Bottom-fixed nav, 7 icons + labels, active = indigo-600. Content scrolls above. Viewport <768px → bottom nav only. ≥768px → top tabs (match v8.4 pattern).

### §8e. Week model
Monday start, America/New_York. ISO week `YYYY-Www`. Shared `<WeekNavigator />` used by Overview + Meal Plan.

---

## §9. Overview Tab — Read-Only

**Skills: `senior-frontend`, `frontend-design`, `ui-ux-pro-max`**

Owns no data. Reads from Schedule, MealPlanSlots, Organized, Dump, Grocery.

### §9a–d. (as in prior sections)
- `<WeekNavigator />` top
- 7 day-cards, Monday first, collapsed by default
- Collapsed row: weekday, date, Leo duty icons, dinner, urgent count, unfiled count
- Grocery summary below grid: `N items across M stores`
- Expanded: full duties, all 4 meal slots, all urgent items, all unfiled captures
- Skeleton loading states. Zero writes.

---

## §10. Meal Plan Tab — Primary Anchor

**Skills: `senior-frontend`, `frontend-design`, `ui-ux-pro-max`**

Defers to BRD §5.4 for ambiguity.

### §10a–d.
- Shared `<WeekNavigator />`
- Grid 4×7 (Breakfast/Lunch/Dinner/Snack × Mon..Sun)
- Empty cell → `+` → bottom sheet: rotation top-3, all recipes search, free-text note
- Commit writes MealPlanSlots; if recipe → grocery projection (§16a)
- Cooked checkbox → timesCooked +1, lastCookedAt now, deduct pantry scaled by `servingsPlanned/baseServings`
- Long-press → skipped (no side effects)
- Suggested-from-rotation horizontal strip above grid

---

## §11. Recipe Detail Modal

**Skills: `senior-frontend`, `frontend-design`**

### §11a–b.
- Name, cuisine, total time, dietary chips
- Servings stepper (displayServings default = baseServings), live scale
- Ingredient list with pantry indicators (✓△✗)
- Method prose
- Notes log (append-only): `YYYY-MM-DD (name): ...`
- Actions: Assign to meal plan, Cook now
- Scaling math: weight-based via density_g_per_ml; `to_taste`/`pinch` pass through; show `(weight unavailable)` when absent

---

## §12. Add Recipe Flow

**Skills: `senior-fullstack`, `senior-prompt-engineer`, `frontend-design`**

### §12a. URL paste
1. Client-side fetch; CORS block → `/fetch-html` fallback.
2. Parse `<script type="application/ld+json">` for `@type: Recipe`.
3. Found → direct extract. **Skip Claude. Free path.**
4. Not found → `/extract-recipe-url` (Haiku).
5. Preview → fuzzy-match Ingredients ≥80%; create new if below.
6. Write Recipe + Ingredients + RecipeIngredients.
7. Dragnet: raw HTML + parsed JSON on Recipe row.
8. If Claude returns malformed JSON per §0b rule 8 → save with `parseStatus: needs_review`, continue.

### §12b. Image upload
1. `<input type="file" accept="image/*" capture="environment">` for mobile.
2. Drive upload via `uploadBinary` → `recipes/` → file ID.
3. Base64 → `/extract-recipe-image`.
4. Preview → same write path.

### §12c. Manual entry fallback
Plain form. Name, ingredient rows, method.

### §12d. FAB on Meal Plan and Pantry tabs.

---

## §13. Pantry Tab

**Skills: `senior-frontend`, `frontend-design`**

### §13a. View
Searchable table. Columns: name, quantity+unit, addedVia badge, expiry (red if ≤7 days). Sort: added desc; toggle expiry asc.

### §13b. FAB with 4 add methods
1. Manual (picker + qty/unit/expiry)
2. Barcode scan → §14
3. Photo receipt → §15a
4. Paste email receipt → §15b

### §13c. Deduction
Automatic on cook (§10c); manual edits supported.

### §13d. Increment
Automatic on cook-reversal, grocery completion (§16c), barcode (§14d), receipt confirm (§15).

### §13e. Needs-review indicator
Items with `needsReview: true` from §0b rule 10 → small amber dot next to name. Clicking opens ingredient edit (inline form).

---

## §14. Barcode Scan

**Skills: `senior-fullstack`, `senior-prompt-engineer`, `dependency-auditor`**

### §14a. Library
ZXing primary: `<script src="https://unpkg.com/@zxing/library@latest/umd/index.min.js"></script>`. If 404 per §0b rule 5 → jsDelivr fallback. BarcodeDetector API progressive on Chromium. iOS Safari → ZXing default.

### §14b. Scanner UI
Fullscreen camera, viewfinder overlay, haptic on decode.

### §14c. Lookup chain
1. Open Food Facts (`GET /api/v2/product/{barcode}.json`). Use if `status === 1`. Write `openFoodFactsBarcode`. Rate-limited per §0b rule 6.
2. USDA FDC — skip if key placeholder (§0b rule 12).
3. Haiku vision wrapper photo → `/extract-barcode-wrapper`.
4. **Final fallback per §0b rule 10:** write `Ingredients` with `canonicalName = "Unknown ({barcode})"`, `needsReview = true`. Pantry row still created so user workflow isn't blocked.

### §14d. Result
Preview → confirm → Ingredients upsert + Pantry row `addedVia = barcode_scan`. Target ≤10s.

---

## §15. Receipt Capture

**Skills: `senior-fullstack`, `senior-prompt-engineer`**

### §15a. Photo (Publix)
Camera → Drive receipts/ → Base64 → `/parse-receipt-photo` → preview with per-row confidence. ≥80% auto-match, <80% per §0b rule 9 (write to ReceiptImports unmatched, NOT to Pantry). Commit → Pantry rows for matched + ReceiptImports row.

### §15b. Digital email (Whole Foods)
Textarea paste → `/parse-receipt-email` → same preview flow. `addedVia = receipt_digital`.

### §15c. Costco PDF — out of scope.

---

## §16. Grocery Extended

**Skills: `senior-frontend`**

### §16a. Projection
On recipe→slot assignment → modal listing ingredients, preferredStore fallback Publix, pantry-suppression markers. Commit → Grocery rows `pantryBacked=false`.

### §16b. Suppression
Check Pantry qty per ingredientId. Sufficient → `pantryBacked=true`, render collapsed "you're good on: X, Y, Z" at top. "Buy anyway" unsuppresses.

### §16c. Completion
Mark done → Pantry row (`addedVia=grocery_completion`), track store; 3 consecutive same-store → set preferredStore.

### §16d. Legacy rows
Null-ingredientId rows render grey-bordered. Tap → "promote": picker + qty/unit → update in place.

---

## §17. Rotation Engine

**Skills: `senior-frontend`**

Computed at render:
```
if (timesCooked < 3) status = 'new'
else if (!lastCookedAt || daysSince(lastCookedAt) > 90) status = 'dormant'
else if (daysSince(lastCookedAt) > 21) status = 'due'
else status = 'active'
```

Top-3 ranking for suggested strip: `due` (oldest) > `active` (oldest) > `new` (most recent) > `dormant` (hidden).

Display only. Never enforces, never auto-assigns.

---

## §18. Model Strategy

**Skills: `senior-prompt-engineer`**

Default `claude-haiku-4-5-20251001`. Grocery parser: per §2b result. Sonnet reserved (none tonight). No Opus. Each prompt = named const at Worker top, with input/output shape comment.

---

## §19. Dependencies

**Skills: `dependency-auditor`**

- React 18 UMD (existing)
- React DOM 18 UMD (existing)
- Babel Standalone (existing)
- Tailwind CDN (existing)
- ZXing-js — audit per §0b rule 20. Approve if MIT + ≤250KB + active.

No build step. Same v8.4 pattern.

---

## §20. Deploy Sequence

**Skills: `senior-devops` (primary), `release-manager`, `env-secrets-manager`**

Fully autonomous where possible. Manual handoff where auth prevents.

### §20.1. Worker deploy
```bash
cd worker
wrangler deploy
```
Fail → §0b rule 4. Success → log endpoint responses from a curl smoke test:
```bash
curl -X POST https://aged-dust-551a.zevallos-fg.workers.dev/parse-grocery \
  -H "Content-Type: application/json" \
  -d '{"text":"need milk and eggs"}'
```
Expect JSON response. Log to build log.

### §20.2. Apps Script — local-only (manual handoff)
Commit updated `apps-script/Code.gs`. HANDOFF.md includes paste instructions.

### §20.3. Sheet init — manual handoff
HANDOFF.md: "Run `initV20Sheets()` once in Apps Script editor."

### §20.4. Weekly backup trigger — manual handoff
HANDOFF.md: "Run `installWeeklyBackupTrigger()` once."

### §20.5. v20 HTML
Already written to `./family-coordinator-v20.html`. Never modify `./index.html`.

### §20.6. Git commit + push
- Commit per section throughout build.
- Final: `git push -u origin main`. Fail → §0b rule 13.

### §20.7. GitHub Pages
Auto-publishes on push. v20 URL: `https://zevallos-fg.github.io/family-coordinator/family-coordinator-v20.html`. v8.4 stays primary at root URL.

---

## §21. Self-Test Checklist (Automated Where Possible)

**Skills: `senior-qa`, `code-reviewer`**

### §21a. Automated tests (Claude Code runs; log results)

| # | Test | How to automate |
|---|---|---|
| 1 | `index.html` unchanged | `git diff --stat index.html` → expect empty |
| 2 | `family-coordinator-v20.html` exists + parseable | Read file, verify valid HTML with React+Babel script tags |
| 3 | ZXing CDN loads (HEAD check) | `curl -I https://unpkg.com/@zxing/library@latest/umd/index.min.js` → 200 |
| 4 | Worker deployed, all endpoints respond | curl each endpoint with minimal valid payload |
| 5 | `parse-grocery` works with new key | curl test; expect `{isGrocery, items}` |
| 6 | Haiku eval artifact exists | `ls eval/haiku-migration-*.md` |
| 7 | Apps Script file contains new functions | grep for `initV20Sheets`, `ensureDragnetFolder`, `weeklyBackup`, `uploadBinary`, `installWeeklyBackupTrigger` |
| 8 | `.gitignore` covers `node_modules/`, `.wrangler/` | grep `.gitignore` |
| 9 | No API keys in any file | `grep -r "sk-ant" .` → expect empty (excluding `.git/`, `node_modules/`) |
| 10 | `wrangler secret list` shows ANTHROPIC_KEY | wrangler command + parse |
| 11 | All 24 sections of prompt addressed in log | grep `./v20-build-log.md` for each `§` header |

Any ❌ → retry once → still ❌ → log + continue + flag in HANDOFF.

### §21b. Manual tests (flagged in HANDOFF for Fernando)

| # | Test | Why manual |
|---|---|---|
| 1 | Mobile viewport bottom nav at <768px | Real device render |
| 2 | Overview tab default on load | Visual verification |
| 3 | All 7 tabs render, no console errors | Browser console check |
| 4 | NYT Cooking URL recipe add (JSON-LD path, zero Claude calls) | Real network verification |
| 5 | Recipe assign → grocery projection → commit | End-to-end |
| 6 | Mark cooked → Recipes.timesCooked +1, Pantry deducted | Cross-sheet |
| 7 | Barcode scan end-to-end ≤10s | Physical product + stopwatch |
| 8 | Publix receipt photo parse | Real receipt |
| 9 | Whole Foods email paste parse | Real email |
| 10 | Legacy Grocery rows render grey-bordered | Visual |
| 11 | `?debug=1` panel shows schema version + cost + needs_review counts | Manual URL |

---

## §22. Autonomous Handoff

**Skills: `pr-review-expert` (primary), `code-reviewer`, `tech-debt-tracker`, `changelog-generator`**

Final action of the session. No user interaction needed.

### §22a. Review sweep
`code-reviewer` over every new/modified file. `pr-review-expert` holistic pass — orphaned code, inconsistent patterns, abandoned branches. Fix issues. Commit: `review: sweep`.

### §22b. Tech debt log
`tech-debt-tracker`. Write/append `./TECH_DEBT.md`:
- Modularization (single-file → components)
- Tasks/Digests/Documents/Maintenance/MealLog/PersonNutritionTarget UX
- Calorie tracking UX
- Structured recipe timing
- Voice recipe capture
- Costco PDF receipts
- Pregnancy-stage filters UX
- Playwright E2E tests
- `appsscript` filename missing `.json` extension
- Apps Script legacy `action === "anthropic"` branch removed (done) — verify before next deploy
- Any items discovered during build

### §22c. Changelog
`changelog-generator`. Write `./CHANGELOG.md` entry for v20 with baseline, new/extended sheets, endpoints, tabs, model shift, eval result, deferrals.

### §22d. HANDOFF.md — the single source Fernando reads on waking
Write `./HANDOFF.md` at repo root. Structure:

```markdown
# v20 Build Handoff — [timestamp]

## TL;DR
- Build result: [SUCCESS / PARTIAL / BLOCKED]
- Files changed: [count]
- Commits pushed to origin/main: [count]
- Rollback: v8.4 still live at index.html

## What shipped
- [tab-by-tab, feature-by-feature summary]

## What Fernando needs to do (IN ORDER)
1. Open Apps Script editor. Copy `apps-script/Code.gs` contents into editor. Save.
2. From editor Run dropdown → select `initV20Sheets` → Run. Confirm 13 new sheets appear in the Google Sheet.
3. From editor Run dropdown → select `installWeeklyBackupTrigger` → Run. Verify in Triggers UI.
4. (Optional) Register for USDA FDC API key at https://fdc.nal.usda.gov/api-key-signup.html. Then `cd worker && wrangler secret put USDA_FDC_KEY` and paste.
5. Open `https://zevallos-fg.github.io/family-coordinator/family-coordinator-v20.html` in browser.
6. Run manual tests from §21b in order — 5-minute smoke test.
7. If everything works and you want v20 to become primary: rename `index.html` → `family-coordinator-v8-4-rollback.html` and `family-coordinator-v20.html` → `index.html`. Commit. Push.

## Automated test results (from §21a)
[filled in autonomously — ✅ or ❌ per item, with diagnosis for failures]

## Manual tests pending (from §21b)
[list as checkboxes for Fernando to tick through]

## Autonomous decisions made
[list every item from §0b that fired, with the decision taken and reasoning]

## Known gaps / handoff items
- [USDA key still placeholder — barcode fallback chain skips USDA]
- [anything else discovered]

## Links
- Build log: `./v20-build-log.md`
- Eval output: `./eval/haiku-migration-YYYYMMDD.md`
- Tech debt: `./TECH_DEBT.md`
- Changelog: `./CHANGELOG.md`

## Rollback
If v20 is broken: v8.4 still live at `zevallos-fg.github.io/family-coordinator/` (serves `index.html` by default). No action needed — v20 is only at `/family-coordinator-v20.html` until you explicitly rename.
```

### §22e. Commit + push
```bash
git add .
git commit -m "v20: complete build (see HANDOFF.md)"
git push -u origin main
```
Push fail → §0b rule 13.

### §22f. Final log entry
```markdown
## [timestamp] — BUILD COMPLETE
Status: [SUCCESS / PARTIAL / BLOCKED]
See HANDOFF.md.
---
```

### §22g. Terminal exit message
`v20 build complete. See HANDOFF.md for manual follow-up steps. Rollback available — v8.4 still live at index.html.`

---

## §23. Non-Negotiables

1. Do not modify `index.html`.
2. Do not break v8.4 data contracts.
3. Do not embed API keys in any committed file.
4. Do not log image payloads.
5. Do not skip the Haiku eval.
6. Do not proceed past §1 without all 4 ground-truth files present.
7. Dragnet always (raw + parsed on every AI entity).
8. Capture ≤10s is the UX bar. Log flows that exceed it.
9. **Do not ask Fernando anything mid-session.** Decide, log, continue.

---

## §24. When Ambiguity Arises (No-Questions Policy)

- Schema → BRD `Family-Coordinator-BRD-v20.md` authoritative.
- Copy/tone → mirror `index.html`.
- UX → fewer taps wins.
- Tech → zero-cost wins.
- Skill for a micro-task → default `senior-fullstack`, escalate to `senior-architect` only if multi-domain.
- Genuine ambiguity still unresolved after all above → pick simplest path, log the choice in build log as a tech debt entry, continue.

---

## §25. Halt Conditions — The ONLY Things That Stop the Build

Halt only if:
1. Any of the 4 §1 ground-truth files missing.
2. An exposed API key detected in any committed file (grep `sk-ant-` across all tracked files returns non-empty).
3. `wrangler deploy` returns "account suspended" or billing error (not transient).
4. Git push fails twice with authentication error.
5. Disk space <100MB free.
6. Unexpected outbound request detected (to a domain not in: api.anthropic.com, cloudflare, google, openfoodfacts, usda, cdnjs, unpkg, jsdelivr, github, npm).

On halt:
1. Write `./HALT.md` at repo root: condition triggered, timestamp, section, what was tried, suggested remediation.
2. Commit what's staged with message `halt: [condition]`.
3. Push if possible.
4. Exit terminal message: `BUILD HALTED. See HALT.md.`

**No other conditions halt the build.** Everything else is logged and recovered per §0b.
