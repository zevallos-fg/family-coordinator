# Haiku Migration Eval — parseGroceryIntent
**Date:** 2026-04-18  
**Eval scope:** §2b of v20 build prompt  
**Worker:** `https://aged-dust-551a.zevallos-fg.workers.dev`  
**Prompt under test:** `parseGroceryIntent` (index.html lines 59–80)  
**Baseline model:** `claude-sonnet-4-20250514`  
**Candidate model:** `claude-haiku-4-5-20251001`  
**Parity threshold:** ≥18/20  

---

## Prompt (verbatim)

```
Analyze this voice/text capture from a parent: "{text}"

Is this a grocery/shopping request? If yes, extract individual item names.

Return ONLY valid JSON:
{"isGrocery": true, "items": ["oregano", "chili powder"]}
or
{"isGrocery": false, "items": []}
```

---

## Results

| # | Category | Input | Sonnet | Haiku | Match |
|---|----------|-------|--------|-------|-------|
| 1 | clear-grocery | We need milk and eggs | `{true, ["milk","eggs"]}` | `{true, ["milk","eggs"]}` | ✅ |
| 2 | clear-grocery | Pick up avocados limes and cilantro from Publix | `{true, ["avocados","limes","cilantro"]}` | `{true, ["avocados","limes","cilantro"]}` | ✅ |
| 3 | clear-grocery | Buy more olive oil | `{true, ["olive oil"]}` | `{true, ["olive oil"]}` | ✅ |
| 4 | clear-grocery | Need to get diapers and wipes at Target | `{true, ["diapers","wipes"]}` | `{true, ["diapers","wipes"]}` | ✅ |
| 5 | clear-grocery | Don't forget bananas and Greek yogurt | `{true, ["bananas","Greek yogurt"]}` | `{true, ["bananas","Greek yogurt"]}` | ✅ |
| 6 | clear-grocery | We're out of garlic and onions | `{true, ["garlic","onions"]}` | `{true, ["garlic","onions"]}` | ✅ |
| 7 | clear-non | Leo has a dentist appointment on Tuesday | `{false, []}` | `{false, []}` | ✅ |
| 8 | clear-non | Pay the electricity bill before Friday | `{false, []}` | `{false, []}` | ✅ |
| 9 | clear-non | I need to call the plumber about the leak | `{false, []}` | `{false, []}` | ✅ |
| 10 | clear-non | Yenny's birthday dinner is at 7pm Saturday | `{false, []}` | `{false, []}` | ✅ |
| 11 | clear-non | Book a flight to New York next month | `{false, []}` | `{false, []}` | ✅ |
| 12 | clear-non | Hurricane season starts in June need to check shutters | `{false, []}` | `{false, []}` | ✅ |
| 13 | ambiguous | Whole Foods run tomorrow | `{false, []}` | `{true, []}` | ❌ |
| 14 | ambiguous | Leo needs more food | `{false, []}` | **APP CRASH** | ❌ |
| 15 | ambiguous | Get some things from the store | `{false, []}` | `{true, []}` | ❌ |
| 16 | ambiguous | Target trip this weekend | `{false, []}` | **APP CRASH** | ❌ |
| 17 | multi-intent | Pick up milk and also remind me to call the dentist | `{true, ["milk"]}` | `{true, ["milk"]}` | ✅ |
| 18 | multi-intent | We need paper towels and also Leo's birthday party is Friday | `{true, ["paper towels"]}` | `{true, ["paper towels"]}` | ✅ |
| 19 | multi-intent | Buy avocados and schedule the AC repair | `{true, ["avocados"]}` | `{true, ["avocados"]}` | ✅ |
| 20 | multi-intent | Costco run for chicken and paper towels also need to pay the water bill | `{true, ["chicken","paper towels"]}` | `{true, ["chicken","paper towels"]}` | ✅ |

---

## Score

**16/20 — FAIL** (threshold: 18/20)

| Category | Parity |
|----------|--------|
| clear-grocery (6) | 6/6 ✅ |
| clear-non (6) | 6/6 ✅ |
| ambiguous (4) | 0/4 ❌ |
| multi-intent (4) | 4/4 ✅ |

---

## Root Cause Analysis

### Failure 1: Haiku adds prose after JSON (T14, T16 — APP CRASH)

Haiku returned valid JSON **followed by explanatory text** in 2/4 ambiguous cases:

```
```json
{"isGrocery": false, "items": []}
```

The statement "Leo needs more food" is a general observation about a child 
needing food, not a specific grocery/shopping request...
```

The current parser (`text.replace(/\`\`\`json|\`\`\`/g, '').trim()`) strips the fences but leaves the trailing prose. `JSON.parse` throws. The current app catches this and silently returns `{isGrocery: false, items: []}` — no crash visible to user, but grocery items are lost.

Sonnet never exhibited this behavior across all 40 runs.

### Failure 2: Classification divergence on store-trip language (T13, T15)

Haiku classifies "Whole Foods run tomorrow" and "Get some things from the store" as `isGrocery: true` with empty items. Sonnet returns `false` for both. Neither is objectively wrong — these are genuinely ambiguous — but Haiku's `{true, []}` output creates a worse UX (grocery modal opens with nothing in it) vs Sonnet's conservative `false` (capture goes to Organized tab).

---

## Recommendation

**Do NOT commit Haiku as default for `parseGroceryIntent`.**

Use Sonnet for grocery routing. Use Haiku for all new v20 endpoints.

**Rationale:**

1. The prose-appending bug is a production regression for ambiguous inputs. It happens silently (the catch block swallows it). Real Yenny voice captures frequently hit this category: "need to grab stuff", "Costco tomorrow", "get more of those crackers Leo likes".

2. The classification divergence on store-trip language causes empty grocery modals — a confusing UX for no gain.

3. Grocery routing is the **only currently live AI call** in v8.4. It has zero margin for silent failure. The new v20 calls (recipe extraction, barcode OCR, receipt parsing) are all net-new with no current baseline to regress.

4. Cost impact is negligible: grocery routing is ~30 calls/month estimated. At Sonnet pricing, that's < $0.05/month — rounding error against the $5 budget.

**Migration path if Haiku is desired later:**

- Fix the parser: replace `JSON.parse(raw)` with a regex that extracts the first `{...}` object, ignoring trailing prose
- Re-add `"Return ONLY the JSON object with no additional text"` to the prompt
- Re-run this eval; expect T14/T16 ERRORs to resolve

**Haiku assignment for v20:**

| Endpoint | Model |
|----------|-------|
| `parseGroceryIntent` (existing) | Sonnet — unchanged |
| `parseItemsFromText` (existing) | Sonnet — unchanged |
| Recipe URL extraction (new) | Haiku 4.5 |
| Recipe image OCR (new) | Haiku 4.5 |
| Barcode vision fallback (new) | Haiku 4.5 |
| Receipt photo OCR (new) | Haiku 4.5 |
| Schedule image analysis (existing) | Sonnet — unchanged (reasoning-heavy) |

---

*Eval run by Claude Code · Family Coordinator v20 build · 2026-04-18*
