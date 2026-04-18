# Family Coordinator

## Business Requirements Document — v20

**Fernando & Yenny · Miami, FL · April 2026**
**Baseline:** v20 (supersedes v8.4)
**Classification:** Internal

---

## 1. Purpose & Problem Statement

Family Coordinator v8.4 solved household coordination: capture, categorize, and surface the stream of logistics in a dual-income household with a toddler.

v20 reframes the system as a **family second brain** — infrastructure that compresses recurring decisions into patterns, so Fernando and Yenny can be present and strategic rather than reactive and fatigued.

The anchor use case for v20 is **meal planning**, the household's highest-frequency decision and the biggest daily drain on mental energy. Meal planning is not a standalone feature — it is the first domain in which the second-brain pattern is applied end-to-end: capture → structure → compress → rotate → decide.

Future domains (finance, health, projects, family memory) will extend the same pattern. v20 establishes the architecture so those domains can activate without re-architecture.

**Success:** Yenny and Fernando experience less daily decision fatigue around food. Meal planning becomes a 15-minute Sunday ritual. Pregnancy and postpartum periods (September 2026 onward) are operationally smoother because the system has already absorbed the work.

---

## 2. Version Narrative (v8.4 → v20)

v20 is not v8.4 + 1 feature. It is a conceptual reset, which is why the version number jumps rather than increments.

| Before (v8.4) | After (v20) |
|---|---|
| Household coordination tool | Family second brain |
| 4 modules (Schedule, Mental Dump, Organized, Grocery) | 4 existing + meal/recipe/pantry/nutrition layer |
| "Expand only when current features proven" | Expand where decision fatigue is the constraint |
| Meal planning explicitly OUT OF SCOPE | Meal planning is the v20 anchor |
| Task Lifecycle scheduled as v9 NEXT | Task Lifecycle architecture stubbed, UX deferred |

**The v8.4 guardrail "meal planning only after grocery and task lifecycle are proven" is formally RETIRED as of April 2026.** Rationale: Fernando's confidence in designing coherent systems has advanced materially since March 2026, and meal planning is the single highest-leverage daily pattern to systematize. The retired guardrail is archived in §12 for reference.

---

## 3. Guiding Principles (Revised)

Every v20 feature decision is evaluated against these principles.

1. **Capture in ≤10 seconds, or the feature fails.** Barcode scan, receipt photo, voice, URL paste — all must be single-tap.
2. **The system does the organizing.** AI classification, smart routing, automatic updates — never ask the user to file.
3. **Dragnet collection, surgical display.** Collect every signal available today (nutrition, barcode, receipt line-items) even if only some surface in v20. Data not collected is data that cannot be recovered.
4. **Schema now, features later.** Tables exist for calorie tracking, Leo's profile, task lifecycle — even when UI does not. Stubbing is cheap; retrofitting is expensive.
5. **Miami-first.** Hurricane prep, school calendar, climate-driven maintenance remain first-class concerns.
6. **Zero ongoing infra cost. Hard cap on Claude API spend ≤$5/month.**
7. **Both parents use it immediately.** Yenny's pregnancy-era adoption is the killer test case.
8. **Export discipline.** Weekly CSV + JSON snapshot to Drive. The backend is replaceable; the data is not.

---

## 4. Current State (v8.4 Recap)

v8.4 is deployed on GitHub Pages and operational. Core modules:

| Module | Status |
|---|---|
| 📅 Schedule — AI-powered calendar image analysis for Leo's daycare duties | Live |
| 🎤 Mental Dump — voice + text capture with AI grocery-intent routing | Live |
| 🧠 Organized — 10 default categories with urgent flags | Live |
| 🛒 Grocery — per-item store assignment, AI routing from Mental Dump | Live |

Infrastructure: Google Sheets (Apps Script), Cloudflare Worker (Claude API proxy), GitHub Pages. 5-second polling sync. Zero ongoing cost.

v20 extends this — it does not replace it. All v8.4 sheets, flows, and data survive unchanged.

---

## 5. v20 Feature Requirements

### 5.1 Recipe Table (First-Class Entity)

Recipes live in a dedicated `Recipes` sheet with canonical schema:

```
recipeId | name | sourceUrl | sourceImage | baseServings |
methodSteps | totalTimeMin | dietaryTags | cuisine |
createdBy | createdAt | timesCooked | lastCookedAt |
rotationStatus | notes
```

Key fields:

- `baseServings`: recipe yield as originally recorded (typical: 4)
- `dietaryTags`: multi-select — enables pregnancy/Leo/filter work now and future calorie-goal work later
- `notes`: append-only, timestamped — the lite calibration loop
- `timesCooked`, `lastCookedAt`, `rotationStatus`: power the rotation engine (§5.7)
- `sourceUrl`, `sourceImage`: raw source preserved for re-extraction with better models (dragnet)

Recipe method (steps) is stored as prose. Structured per-step timing is future enhancement.

### 5.2 Ingredient Table (Canonical Reference)

Every recipe ingredient resolves to a row in `Ingredients`. One ingredient serves many recipes.

```
ingredientId | canonicalName | usdaFdcId | openFoodFactsBarcode |
density_g_per_ml | nutritionPer100g (JSON) |
preferredStore | lastUpdated
```

- `usdaFdcId`: USDA FoodData Central ID, nullable. Backfilled as calorie tracking activates.
- `openFoodFactsBarcode`: UPC/EAN from barcode scanner (§5.8c).
- `nutritionPer100g`: JSON blob — kcal, protein_g, carb_g, fat_g, fiber_g, sodium_mg at minimum. Iron, folate, calcium included from day one given pregnancy context. Additional micronutrients added without migration since structure is JSON.
- `preferredStore`: learns over time. When chicken breast has been purchased at Costco 3 times in a row, Costco becomes the default assignment.
- `density_g_per_ml`: enables volumetric→weight scaling (see §5.3).

### 5.3 Recipe Ingredient Join (Scaling Layer)

```
recipeIngredientId | recipeId | ingredientId |
quantity | unit | preparation | isOptional
```

- `unit`: enum {g, kg, ml, l, tsp, tbsp, cup, oz, lb, piece, pinch, to_taste}
- **Weight-based scaling is primary.** Volumetric units (tsp/tbsp/cup/ml) are converted to weight via `density_g_per_ml` when available; labeled "weight unavailable" otherwise.
- `to_taste` and `pinch` pass through flat — do not scale linearly.
- `preparation`: freeform ("minced", "cubed", "room temp").
- Scaling UI: a single stepper on the recipe view adjusts `displayServings`; all quantities recompute live.

### 5.4 Meal Planning — Week Ahead View (PRIMARY UI ANCHOR)

The primary v20 entry point. Displays the current week with four slots per day.

```
Slot      | Mon | Tue | Wed | Thu | Fri | Sat | Sun
Breakfast | ... | ... | ... | ... | ... | ... | ...
Lunch     | ... | ... | ... | ... | ... | ... | ...
Dinner    | ... | ... | ... | ... | ... | ... | ...
Snack     | ... | ... | ... | ... | ... | ... | ...
```

Each slot is nullable. Most weeks only dinner will be heavily populated — the architecture supports full population without demanding it.

Schema:

```
slotId | weekOf | dayOfWeek | slot | recipeId | servingsPlanned |
noteFreeText | cookBy | cookedStatus
```

- `noteFreeText`: informal logging ("ordered pizza") without requiring a recipe record
- `cookBy`: optional attribution (Fernando / Yenny / Both) — same pattern as v8.4 capture attribution
- `cookedStatus`: {planned, cooked, skipped} — drives pantry deduction and `timesCooked` increment
- Selecting a recipe for a slot auto-projects its ingredients into that week's grocery list

### 5.5 Pantry Tracking

New `Pantry` sheet:

```
pantryId | ingredientId | quantity | unit | addedAt | addedVia | expiryDate
```

- `addedVia`: enum {manual, receipt_digital, receipt_photo, grocery_completion, barcode_scan}
- Quantity **deducts automatically** when a recipe slot is marked cooked (via `cookedStatus = cooked`)
- Quantity **increments** on grocery completion, receipt processing, or direct barcode-scan add
- Expiry date: optional, nullable — populated from receipts when present, manual for fresh items

Pantry state drives two decisions in v20:
1. Grocery list deduplication — don't add what you already have (with override: "buy anyway")
2. Pantry count visible at recipe view — "you have 2 of 5 ingredients"

Future: pantry-driven recipe suggestions ("we have chicken + mushrooms, show matching recipes"). Schema supports this today; UI deferred.

### 5.6 Grocery Integration (Upgrades to v8.4 Module)

v8.4 Grocery module extends rather than replaces:

- When a recipe enters a meal slot, its ingredients auto-project to grocery list for that week
- Ingredient `preferredStore` auto-assigns grocery rows to stores
- Pantry state suppresses items already on hand (with override)
- Quantity + unit columns added to grocery rows
- Completing a grocery item → marks done + adds to Pantry simultaneously

### 5.7 Recipe Rotation Engine

Rotation solves the real meal planning problem: "decide dinner from our 15 recipes, not from the internet's 10,000."

Rules (baseline — calibrate from usage):

- A recipe enters `active` rotation after being cooked 3+ times
- `lastCookedAt` > 21 days → status becomes `due` (surfaced as "haven't made in a while")
- `lastCookedAt` > 90 days → status becomes `dormant` (still searchable, not surfaced by default)
- New recipes show `new` until threshold

Rotation is **display logic, not enforcement.** Fernando and Yenny always override. The week-ahead view includes a "suggested from rotation" strip when planning is open.

### 5.8 Input Methods

Four pathways for creating Recipes, Ingredients, or Pantry entries:

#### 5.8a URL Paste

1. Fetch page, parse `<script type="application/ld+json">` for Schema.org/Recipe — **free, no API call**.
2. If structured data present (~80% of major recipe sites: NYT Cooking, Serious Eats, Food Network, Bon Appétit, King Arthur, Smitten Kitchen, AllRecipes): extract directly, zero cost.
3. If not: pass HTML to **Claude Haiku 4.5** via the Worker. Estimated ~$0.015 per extraction.
4. Store raw HTML + parsed JSON on the Recipe row. Re-extraction with future models becomes trivial (dragnet).

#### 5.8b Image Upload

1. Single call to Claude Haiku 4.5 with vision. Estimated ~$0.02–0.04 per image.
2. Extracts recipe name, ingredient list, steps into canonical schema.
3. Original image stored in Drive. Parsed JSON stored on Recipe row. Both kept (dragnet).
4. Use case: cookbook photos, screenshots of text messages from family, handwritten recipes.

#### 5.8c Barcode Scan (Packaged Foods — Primary Yenny Flow)

1. Browser `BarcodeDetector` API; fallback to ZXing JS library where unsupported.
2. Client-side barcode decode — **zero API cost for decode**.
3. Lookup sequence:
   - **Open Food Facts** (free, ~3M items, barcode-native) — primary
   - **USDA FoodData Central** (free, ~350K branded items) — fallback
   - **Claude Haiku vision on wrapper photo** — last resort when neither source has the item
4. Writes to `Ingredients` with nutrition + barcode. Adds to `Pantry` when scan context is "add to home".
5. **Use case: Yenny scans a snack in 3 seconds.** Nutrition catalogs automatically for future calorie work; pantry updates; decision fatigue reduced.

#### 5.8d Receipt Capture

1. **Digital receipt** (Whole Foods email, Costco PDF): upload file or paste content. Apps Script or Worker parses line items. Fuzzy-match to `Ingredients` (with manual confirmation for low-confidence matches). Writes to `Pantry` with `addedVia = receipt_digital`.
2. **Photo receipt** (Publix, other in-store): Claude Haiku vision extracts line items. Estimated ~$0.03 per receipt. `addedVia = receipt_photo`.
3. `ReceiptImports` sheet stores the original receipt + parsed JSON + line-item mapping audit. Enables re-processing and tracks match confidence over time.
4. Fernando is the primary receipt operator; fast-path design: upload → preview parsed items → confirm → done.

### 5.9 Recipe Calibration Notes (Lite Wiki Pattern)

Each Recipe has an **append-only** `notes` field. Every cook session can add a timestamped note:

```
2026-04-18 (Fernando): doubled garlic, reduced salt by half, 5 min longer in oven — better
2026-05-02 (Yenny): used whole wheat pasta, worked fine
2026-05-18 (Fernando): tried with shrimp instead of chicken — good but prefer chicken
```

This is the lite version of the E5a wiki calibration loop: the recipe evolves with family use. No classifier. No AI retraining. No feedback loop automation. Just structured notes that accumulate institutional knowledge.

**Future enhancement (cataloged, not in v20):** automated summarization of notes into a "current best version" consolidated field. That is the full calibration loop — deferred.

---

## 6. Feature Stub Architecture (Schema Today, UX Later)

Per guiding principle #4, these tables exist in v20 with empty or minimal UX. Activating each feature later requires no schema migration.

| Stubbed Feature | Tables Created | Activation Trigger |
|---|---|---|
| Calorie / macro tracking | `MealLog`, `PersonNutritionTarget` | When a target is set |
| Leo's profile | `Family` sheet with Leo row | When toddler features prioritized |
| Task Lifecycle (original v9 scope) | `Tasks` | When UX is built |
| Weekly Digest (original v10 scope) | `Digests` | When digest generator is built |
| Document Vault (original v11 scope) | `Documents` | When upload UX is built |
| Maintenance Cadence (original v12 scope) | `Maintenance` | When UX is built |
| Pantry-driven recipe suggestions | Already supported via Pantry + Ingredient joins | When UI is designed |

### Family Schema (stubbed)

```
personId | name | role | birthDate | dietaryRestrictions |
nutritionTargetId | createdAt
```

Seed rows: Fernando, Yenny, Leo.

### Meal Log (stubbed)

```
logId | date | slot | recipeId | ingredientId | servingsConsumed | personId | loggedAt
```

Empty in v20. Populated when calorie tracking activates.

### Person Nutrition Target (stubbed)

```
targetId | personId | startDate | dailyKcalTarget | macroSplitJSON |
micronutrientTargetsJSON | notes
```

Empty in v20. Provides the hook for Yenny's prenatal targets, Leo's growth targets, Fernando's personal targets when any of those activate.

---

## 7. Non-Features (Explicitly Out of Scope for v20)

To preserve focus on meal planning as the anchor, the following are not built in v20. Each has an architectural hook so future activation is low-friction.

- **Leo as first-class user with dedicated meal plans.** Architecture stubbed; UX deferred.
- **Calorie tracking UX.** Nutrition data is collected via barcode / USDA / recipes; daily/weekly totals display is not built.
- **Structured per-step recipe timing.** Method stored as prose.
- **Voice capture for recipes.** Mental Dump can still catch meal *ideas*; recipe creation is URL / image / barcode only.
- **Restaurant menu capture.** The "remember what we ate out" use case is valuable but deferred.
- **Undocumented family recipes (Yenny's memory).** Guided entry flow is future.
- **Full 3-layer wiki classifier.** Lite calibration via notes only. No taxonomy + article + classifier stack.
- **Pregnancy-stage dietary filters UI.** Dietary tags schema supports it; filter UI is future.
- **Pantry-driven recipe suggestions UX.** Schema ready; UI is future.
- **Full OCR on document vault.** Unchanged from v8.4.
- **External calendar sync (Google / Outlook).** Unchanged from v8.4.
- **Native mobile app.** Unchanged from v8.4.
- **Sharing with extended family.** Unchanged from v8.4.

---

## 8. Future Enhancement Catalog

The v20 design deliberately leaves architectural hooks for these future domains. **Nothing below is in v20 scope.** Listing establishes intent and ensures we don't accidentally foreclose future work in v20 design decisions.

### Meal / Nutrition

- Calorie and macro tracking UX with daily/weekly targets and trend charts
- Leo's toddler-specific meal planning, portion sizing, age-appropriate options
- Pregnancy-stage dietary filters (2nd trimester, 3rd trimester, postpartum recovery)
- "Suggest from pantry" — reverse lookup given current pantry state
- Automated recipe-notes summarization ("current best version" consolidation)
- Allergen and sensitivity tracking with cross-recipe warnings
- Restaurant log and eating-out capture
- Family recipe guided entry (oral history / Yenny's memory capture)
- Voice-capture recipe creation
- Shopping price tracking over time per ingredient per store

### Household Second Brain Extensions

- Financial planning layer — recurring expenses, budget pattern detection, bill forecasting
- Health planning layer — pediatric appointments, vaccinations, family medical timeline
- Project planning layer — home improvement, Miami hurricane prep as project, school transitions
- Decision log — decisions made, context, retrospective notes
- Family memory layer — milestones, stories, photos with date anchoring
- Pattern detection across all captures (evolution of the v10 Weekly Digest concept)

### Technical

- Full calibration loop — AI-summarized best recipe versions from accumulated notes
- 3-layer wiki pattern if breadth justifies it (taxonomy + per-entity article + classifier)
- Obsidian integration for long-form / narrative content — explicitly a separate system from structured tables
- Supabase / Postgres migration path when Google Sheets limits bind (~5M cells)
- Receipt-driven price history per ingredient per store (feeds preferredStore intelligence)

---

## 9. Technical Architecture

**Unchanged from v8.4:**

- Single HTML file on GitHub Pages
- Google Sheets (Apps Script) as primary database
- Cloudflare Worker as Claude API proxy
- Google Drive for binary files (images, receipts)
- 5-second polling sync
- Zero ongoing hosting cost

**New in v20:**

| Layer | Implementation | Cost |
|---|---|---|
| Recipe JSON-LD parser | In-browser fetch + JSON parse of Schema.org/Recipe | $0 |
| Barcode reader | Browser `BarcodeDetector` + ZXing JS fallback | $0 |
| Open Food Facts lookup | Public API | $0 |
| USDA FoodData Central lookup | Public API (free key registration) | $0 |
| Claude extraction calls | Haiku 4.5 via existing Worker | <$5/mo target |
| Receipt photo OCR | Claude Haiku 4.5 vision via Worker | Bundled in above |
| Export snapshots | Apps Script → Drive, weekly CSV + JSON | $0 |

**Model selection rule:** Default to Haiku 4.5 for all new AI calls (extraction, OCR, barcode fallback, classification). Sonnet reserved for reasoning-heavy tasks only. Consider downgrading existing grocery parser from Sonnet 4 to Haiku 4.5 — grocery routing is classification, not reasoning.

**Dragnet storage rule:** For every AI-extracted entity, store both the raw source (URL, image, HTML, receipt) AND the parsed JSON. Re-extraction with better models in the future becomes a non-event. Applies to recipes, receipts, and barcode-wrapper photos.

**Export discipline:** Weekly Apps Script job snapshots all Sheets tables to a `/Family-Coordinator-Backup/YYYY-MM-DD/` folder in Drive as CSV + JSON. Zero cost. Enables migration to any backend (Supabase, Obsidian, Notion, self-hosted) without data loss. ~30 lines of Apps Script.

**Cost estimate at projected usage:**

| Input | Volume/month (est.) | Unit cost (est.) | Monthly cost (est.) |
|---|---|---|---|
| Recipe URL with JSON-LD | 16 | $0 | $0 |
| Recipe URL without JSON-LD | 4 | $0.015 | $0.06 |
| Recipe image upload | 5 | $0.03 | $0.15 |
| Barcode vision fallback | 2 | $0.03 | $0.06 |
| Photo receipt OCR | 6 | $0.03 | $0.18 |
| **Total estimated** | | | **~$0.45/mo** |

Budget target: <$5/month — approximately 10x headroom on estimate above.

---

## 10. Success Metrics

**Qualitative (primary):**

- Sunday meal planning becomes a routine (<15 minutes) rather than a negotiation
- Yenny finds barcode scan and recipe notes effortless during 2nd/3rd trimester
- Grocery runs become fewer and more accurate — pantry state is trusted
- Fernando no longer experiences "what's for dinner" decision fatigue at 5pm
- The system survives September–October 2026 postpartum period without being abandoned

**Quantitative (secondary):**

- ≥10 recipes in active rotation by end of Q2 2026
- ≥70% of dinners planned via the system rather than improvised
- Weekly grocery list generation in <2 minutes
- Barcode lookup success rate ≥85% (Open Food Facts + USDA combined)
- Claude API spend <$5/month, target <$1/month
- Recipe re-cook rate (rotation working) ≥60% of all meals planned

---

## 11. Open Questions

| # | Question | Decide By |
|---|---|---|
| 1 | Barcode library — `BarcodeDetector` native vs ZXing polyfill. Confirm browser support on mobile Safari / Chrome in Miami household devices. | Pre-build |
| 2 | Receipt parsing — Whole Foods / Costco digital receipts: email ingestion automation vs manual PDF upload? | v20 sprint start |
| 3 | USDA FDC API key — register under Fernando's personal address or a dedicated family address? | Pre-build |
| 4 | Dietary tags initial seed — proposed: {pregnancy-safe, iron-rich, folate-rich, high-protein, postpartum-comfort, toddler-friendly, vegetarian, gluten-free, dairy-free, quick (<30min), one-pot, batch-friendly}. Confirm or adjust. | v20 sprint start |
| 5 | Rotation thresholds — confirm 3-cook "active" and 21-day "due" defaults, or calibrate from 4 weeks of real usage? | v20 sprint + 4 weeks |
| 6 | Ingredient fuzzy matching on receipt imports — confidence threshold before asking user to confirm? (Proposed: 85%) | v20 sprint start |
| 7 | Leo's age at v20 activation — does the Family sheet seed him with a dietary-restrictions stub even though UI is deferred? (Recommendation: yes, blank) | Pre-build |

---

## 12. Migration from v8.4

**No destructive migration.** All v8.4 sheets and flows remain operational. v20 adds:

New sheets:

- `Recipes`
- `Ingredients`
- `RecipeIngredients`
- `MealPlanSlots`
- `Pantry`
- `ReceiptImports`
- `Family` (seed: Fernando, Yenny, Leo)
- `MealLog` (stub — empty in v20)
- `PersonNutritionTarget` (stub — empty in v20)
- `Tasks`, `Digests`, `Documents`, `Maintenance` (stubs from prior roadmap)

Extended sheets:

- **Grocery tab:** new columns `quantity`, `unit`, `pantryBacked`, `ingredientId` (nullable — retains freeform support for v8.4 items)

Existing v8.4 data survives untouched. New columns are nullable. New flows are additive.

---

## 13. Archived — Retired Guardrails

Recorded for reference. These no longer apply as of April 2026.

| Archived Guardrail | Source | Reason for Retirement |
|---|---|---|
| "Meal planning module — only after Grocery and Task Lifecycle are proven in daily use" | v8.4 §6 Non-Features | Meal planning is v20 anchor; decision-fatigue constraint is binding more than feature-proof-out |
| "Expand only when current features are proven — do not add complexity before adoption is confirmed" | v8.4 §2 Guiding Principles | Replaced with v20 Principle #1 (capture friction) and #7 (Yenny pregnancy as adoption test) |

---

## 14. Version History

| Version | Date | Change |
|---|---|---|
| v8.4 | March 2026 | Grocery Intelligence baseline — AI routing, per-item store assignment |
| **v20** | **April 2026** | **Second-brain reframe; meal planning anchor; recipe / pantry / nutrition / receipt / barcode architecture** |

---

*Family Coordinator · Internal · Fernando & Yenny Zevallos · Miami, FL · April 2026*
