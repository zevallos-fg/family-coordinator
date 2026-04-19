# Changelog

## [32.0.0] — 2026-04-19

**Audit close-the-loop release.** All 23 findings from the April 19 adversarial audit resolved.

### Fixed (High severity)
- Client-only greeting resolves React hydration error #418; four time buckets: morning/afternoon/evening/night (#11, #22)
- Grocery badge shows total count, not capped 5-item preview slice (#1)
- Mobile WeekPicker "This week" button restored (was hidden behind sm: breakpoint) (#3)

### Fixed (Medium severity)
- WeekPicker visual label updated to "This week" (#4)
- 404 page renders with app shell + back-to-dashboard CTA (#5)
- Dashboard schedule CTA relabeled "Plan next week →" (#6)
- Mobile capture hides desktop-only "Cmd+Enter" hint (#7)
- Quick brief button uses primary amber (#8)
- Recipe names normalized to Title Case — 6 backfilled (#9)
- SwapRecipeDialog has real-time search filter (#18)
- Dead duplicate View button in ShiftCard — confirmed already absent (#21)
- /api/spend server-side 60s LRU cache + client raised to 5min poll (#20, #23)

### Fixed (Low severity)
- Receipts upload zone uses proper `<label>` — screen reader and keyboard accessible; camera still works (#2)
- Grocery tap targets ≥44px (Apple HIG / WCAG 2.5.5) (#12)
- Caregiver phone numbers formatted (XXX) XXX-XXXX (#13)
- New caregiver names + roles normalized to Title Case on save (#14)
- Layout containers standardized — caregiver + receipts list match other pages (#15)
- Dashboard "Pending" empty state has "+ Capture →" CTA (#16)
- Family default_serves configurable (1–20, default 4); meal planner respects it (#17)

### Fixed (Performance)
- Supabase server client memoized per-request via React.cache() — eliminates repeated auth.getUser() calls (#19)

### Added
- Playwright E2E test suite with Chromium + WebKit + GitHub Actions CI
- 29 regression tests covering all audit findings across 3 spec files
- `lib/format/phone.ts`, `lib/format/titleCase.ts` helpers
- `/settings` page with family default_serves selector + nav link
- `families.default_serves` column (migration applied)

### Migrations applied
- `20260419_api_usage_diagnostics.sql` (v0.2.1 — response_preview + error_message)
- `20260419_recipe_backfill_v0.2.1.sql` (v0.2.1 — description, tags, times)
- `20260419_recipe_title_case_and_default_serves.sql` (v32.0 — title case + default_serves)

---

## [0.3.0] — 2026-04-19

### Fixed
- Grocery badge shows real total count, not capped preview count (#1)
- Dashboard schedule CTA relabeled "Plan next week →" (#6)
- Dashboard pending empty-state adds "+ Capture →" link (#16)
- WeekPicker "This week" button restored on mobile — was hidden behind sm: breakpoint (#3)
- WeekPicker label changed from "Today" to "This week" to match aria intent (#4)
- Mobile Cmd+Enter keyboard hint hidden on small screens (#7)
- Quick brief button now uses amber primary color (#8)
- Grocery list checkbox + delete tap targets ≥44px (Apple HIG / WCAG 2.5.5) (#12)
- Caregiver phone numbers formatted as (XXX) XXX-XXXX (#13)
- New caregiver names + roles normalized to Title Case on save (#14)
- Caregiver + Receipts list pages use consistent full-width layout (#15)
- MealPlanCard titles use `line-clamp-2` — no single-line truncation (#10)

### Added
- `app/not-found.tsx` — 404 page with app shell + back-to-dashboard CTA (#5)
- `lib/format/phone.ts` — phone number formatter
- `lib/format/titleCase.ts` — title-case helper with name particle support (de, la, van, von)
- 13 Playwright regression tests for PR-2 scope

---

## [0.2.2] — 2026-04-19

### Fixed
- Client-only `Greeting` + `TodayDate` components resolve React hydration error #418 (#11, #22)
  — greeting now shows correct local-time bucket (morning/afternoon/evening/night)
  — evening threshold corrected: 17:00–21:59 (was implicitly missing "night" bucket)
- 18 pre-existing lint errors cleaned: `<a>` → `<Link>` in 4 files, unescaped entities, refs accessed during render in `receipts/new`, setState in effect in `PantryAddForm`

### Added
- Playwright E2E test runner with Chromium + WebKit projects (`npm run test:e2e`)
- GitHub Actions workflow for Playwright on PR and main push (`.github/workflows/playwright.yml`)
- `tests/e2e/dashboard-greeting.spec.ts` — regression for greeting correctness + hydration cleanliness

### Engineering note
**Sentry action required (Fernando):** Configure a Sentry alert to fire on any React error #418 in production. Should be 0 after this deploy.
**GitHub Secrets required (Fernando):** Add all 8 env vars from `.env.local` to GitHub repo secrets for CI to build and run E2E tests.

---

## [0.2.1] — 2026-04-19

### Renamed
- The Meals section is now "Meal Plans" everywhere: nav, routes, and docs
- Old `/meals`, `/meals/plan`, `/meals/recipes`, `/meals/pantry` URLs return 404 — use `/meal-plans/*` instead
- The T3 landing page was removed; `/meal-plans` IS the plan grid (with week navigation from v0.2.0)

### Added
- `api_usage` now captures `response_preview` (first 500 chars of Sonnet/Haiku output) and `error_message` on every skill call for post-hoc debugging
- `fn_skill_update_diagnostics` Postgres RPC for secure error reporting from the skill runner
- Recipe importer now extracts `description`, `tags` (controlled vocabulary), `prep_time_min`, and `cook_time_min` from imported sources; max tokens increased to 2000
- Recipe list and detail pages now surface descriptions, tag chips (slate-100 style), prep/cook times, and numbered instruction steps

### Fixed
- Skill runner now captures the `api_usage` row ID returned by `fn_skill_record_usage` and writes `response_preview` immediately after every call — zero additional DB roundtrips on the happy path
- The 13 existing recipes were backfilled with curated descriptions, tags, times, and instructions (all 13 had null metadata before this patch)
- Overnight Oats instructions were empty `[]` — backfilled with 4 canonical steps
- `RecipeDetail` now shows an "No instructions yet" empty state instead of a blank section when instructions are absent

### Unchanged (intentional)
- `generatePlanAction` logic — data enrichment is the upstream fix; Sonnet call is untouched
- `family-meal-planner` skill prompt — unchanged
- Schedule, Caregiver, Dashboard, Capture, Organized, Grocery, Receipts — no route changes
- All 96 pre-existing unit tests pass unchanged

### Tech debt logged
- `/meal-plans/plan/[id]` route is now orphaned (no navigation links to it); candidate for removal in v0.3.0
- Recipe edit UI not built (instructions field is view-only; "Edit to add them" placeholder is shown)
- Recipe library depth (13 recipes) is still thin; grows through normal use

---

## [0.2.0] — 2026-04-19

### Added

- **Cross-app week navigation** — all three week-scoped pages (Meals/Plan, Schedule, Caregiver) now have a WeekPicker component at the top. Navigate ±4/+8 weeks with prev/next buttons; a "Today" button snaps back to the smart default.
- **Context-aware default week rule** — Mon–Thu lands on the current week; Fri–Sun lands on next Monday (weekend planning mode). This means on any day, the app opens on the week you're either living or actively planning.
- **`lib/week.ts`** — shared pure-JS date helpers: `defaultPlanWeek`, `parseWeekParam`, `formatWeekParam`, `formatWeekRange`, `clampWeek`, `addDays`. 20 unit tests covering all boundary cases including the Thu→Fri transition and the Sunday `getDay()=0` edge case.
- **`hooks/use-week-param.ts`** — client hook for reading/writing `?week=YYYY-MM-DD` URL params.
- **`components/ui/WeekPicker.tsx`** — controlled week navigation UI using `lucide-react` chevrons.
- **`components/ui/WeekPickerNav.tsx`** — thin client wrapper that connects WeekPicker to URL state.

### Changed

- **`/meals/plan`** — converted from "redirect to latest plan ID" to week-based view (`?week=YYYY-MM-DD`). Shows existing plan grid or empty state with a generate button that explicitly names the target week (e.g., "Generate plan for week of Apr 27"). A compact "Replace plan" button appears when a plan exists.
- **`/schedule`** — week picker at top; schedule entries fetched for the selected Mon–Sun range; "Upload calendar" link carries the selected week to the upload page.
- **`/schedule/upload`** — reads `?week` from the URL and passes it to the UploadForm. The UploadForm now shows which week duties will be assigned to.
- **`/caregiver`** — week picker at top; shifts section now shows only shifts for the selected week (queried by `start_at` timestamp range) instead of the 10 most recent shifts across all time.
- **`/caregiver/shifts/new`** — "New shift" pre-fills `start_at` intelligently: today at 08:00 if today is within the selected week, otherwise Monday of the selected week at 08:00.

### Fixed

- **Duplicate meal plan generation** — `generatePlanAction` now checks for an existing plan before calling Sonnet. If one exists it returns a `requiresConfirmation` flag to the client without making an AI call. The client shows a confirmation dialog naming the specific week; on confirm, `replacePlanAction` runs Sonnet first and only deletes the old plan after a successful generation (no half-states on Sonnet failure).
- **Leftover meal cards** — `MealPlanCard` now distinguishes `recipe_id=NULL + notes` (leftover, amber styling, notes text shown verbatim) from truly empty cells (gray dashed). Previously both cases were styled identically and leftovers showed "No recipe assigned".
- **Schedule upload replace dialog** — uploading a calendar screenshot to a week that already has duties now shows a "Replace existing schedule?" confirmation dialog before overwriting. The underlying `saveReconciliation` action already used DELETE-then-INSERT; this adds the UX safety net.

### Tech debt logged

- Dashboard week toggle (skipped in this PR — Phase 7)

---

## [0.1.0] — 2026-04-18

Initial release — T1 Foundation, T2 (schedule v8.4 port), T3 (meals + Sonnet planner), T4 (receipts + barcodes), T5 (caregiver hub).
