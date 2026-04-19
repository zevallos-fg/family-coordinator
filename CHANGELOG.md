# Changelog

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
