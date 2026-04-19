# Phase 0 Onboarding Notes — v0.2.0 Week Navigation

## Answers to the 5 pre-flight questions

### (a) Date library
**Native `Date` only.** No date-fns, dayjs, or other library in `package.json`.
All helpers in `lib/week.ts` must use pure JS. Icons available via `lucide-react`.

### (b) Toast component
`import { toast } from "sonner"` — call `toast.error(msg)` / `toast.success(msg)`.
`<Toaster>` is already mounted in `app/layout.tsx`.

### (c) Dialog component
No shadcn/ui or Radix Dialog installed. Custom inline modal pattern throughout:
`useState(false)` + `<div className="fixed inset-0 z-50 ...">` overlay.
See: `components/meals/MealPlanWeek.tsx` (swap modal) and `components/caregiver/QuickBriefModal.tsx`.

### (d) Server action locations
- `app/(app)/meals/actions.ts` — `generatePlanAction`, recipe, pantry actions (528 lines)
- `app/(app)/schedule/actions.ts` — `processScreenshot`, `saveReconciliation`, `deleteEntry`
- `app/(app)/caregiver/actions.ts` — `createShift` and caregiver management

### (e) T2 calendar-upload duplicate handling
`saveReconciliation()` uses **DELETE-then-INSERT** — NOT a silent 23505 bug.
Lines 99–106 of `app/(app)/schedule/actions.ts`:
```ts
const dates = [...new Set(rows.map((r) => r.date))];
await supabase.from("schedule_entries").delete()
  .eq("family_id", membership.family_id).in("date", dates);
const { error } = await supabase.from("schedule_entries").insert(rows);
```
Per Phase 5 spec: leave the delete-then-insert logic alone; add a UX safety-net
"Replace existing duties?" dialog when uploading to a week that already has rows.

## Key architecture facts

### Current routing
- `/meals` — hub page (`app/(app)/meals/page.tsx`) — has generate button for current week only
- `/meals/plan` — redirects to latest plan ID (`app/(app)/meals/plan/page.tsx`)
- `/meals/plan/[id]` — plan detail view (`app/(app)/meals/plan/[id]/page.tsx`) — renders `MealPlanWeek`
- `/schedule` — server component, hardcoded `getWeekRange()` to current week
- `/schedule/upload` — `UploadForm` hardcodes `getWeekStart()` to current week
- `/caregiver` — server component, fetches 10 most recent shifts (not week-scoped)
- `/caregiver/shifts/new` — `ShiftForm` defaults `start_at` to `new Date()` at 08:00

### Components to build
- `lib/week.ts` — pure date helpers (native Date)
- `lib/week.test.ts` — all spec test cases
- `components/ui/WeekPicker.tsx` — controlled component (`weekStart`, `onWeekChange`)
- `components/ui/WeekPickerNav.tsx` — thin "use client" wrapper that connects WeekPicker to `useWeekParam`
- `hooks/use-week-param.ts` — reads `?week` from `useSearchParams`, writes via `router.push`
- `hooks/use-week-param.test.ts` — URL param parsing tests

### Key visual pattern (existing page headers)
```tsx
<h1 className="text-xl font-semibold text-stone-800">Schedule</h1>
<p className="text-sm text-stone-400 mt-0.5">This week's Leo duties</p>
```
Color palette: `stone-800` titles, `stone-400` subtitles, `amber-600` primary action buttons.

### Leftover card fact
`MealPlanCard` already handles `recipe_id=null` correctly:
- Line 44–46: `isEmpty ? <p>{notes ?? "No recipe assigned"}</p> : <Link>recipe</Link>`
- BUT it styles empties as "dashed gray" even for leftovers with notes.
- Fix in Phase 4a: distinguish `isEmpty && !notes` (true empty) from `isEmpty && notes` (leftover).
