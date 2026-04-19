# T2 — v8.4 Port — Complete

## Shipped

### App shell
- Responsive top nav (desktop) + hamburger (mobile) with all 8 tab links
- Warm household color palette (amber/stone/emerald, not the finance blue)
- Spend indicator (`$X.XX / $10.00`) polling `/api/spend` every 60s
- `app/(app)/layout.tsx` auth gate — bounces unauthenticated users to login

### Dashboard (rebuilt from T1 placeholder)
- Greeting with family name and today's date
- Today's care duties widget (from `schedule_entries`)
- Unresolved captures widget (from `captures` where `completed_at IS NULL`)
- Pending grocery items widget (from `grocery_items` where `in_cart = false`)
- Quick capture link → `/capture/new`

### Schedule tab
- `app/(app)/schedule` — this week's saved duties in card view
- `app/(app)/schedule/upload` — drag-drop calendar screenshot upload
- `UploadForm` — analyze → review duties → approve → save to DB
- `WeekView` + `DutyBadge` components
- v8.4 scheduling algorithm: red events ignored, 3 duty windows (drop-off 9–9:30, pick-up 12:30–1, nap 1:30–2)
- `DISCUSS` shown when neither parent is free

### Capture / Mental Dump tab
- `app/(app)/capture` — list of all pending captures
- `app/(app)/capture/new` — large textarea + voice button (Web Speech API)
- Voice button degrades gracefully if API unavailable
- All captures routed via `family-capture-router` (T1 skill, unchanged)
- Grocery items auto-split and inserted into `grocery_items`

### Organized tab
- `app/(app)/organized` — captures grouped by category in card columns
- Urgent categories highlighted (amber background)
- Resolve (mark done) and delete actions per item

### Grocery tab
- `app/(app)/grocery` — checklist UI with store filter tabs
- Free-text add form parsed by `family-grocery-parser` (structured items with quantity + store)
- Toggle in-cart with optimistic UI
- Shows all items including those added by T3 meal planner

## Skills implemented

| Skill | Model | Purpose |
|-------|-------|---------|
| `family-schedule-reconciler` | Haiku (vision) | Calendar screenshot → weekly duty assignments |
| `family-grocery-parser` | Haiku | Free text → structured grocery items |
| `family-capture-router` | Haiku | Used as-is from T1 — not modified |

## Placeholder pages for other tracks

| Route | Track | Status |
|-------|-------|--------|
| `/meals` | T3 | Placeholder — "coming soon" |
| `/receipts` | T4 | Placeholder — "coming soon" |
| `/caregiver` | T5 | Placeholder — "coming soon" |

## Cross-track integration

- **T3 → T2 Grocery**: T3's meal planner writes to `grocery_items` table. The grocery tab reads all items regardless of source — T3 items appear automatically once T3's branch merges.
- **T3/T4/T5 nav links**: Nav in `TopNav.tsx` and `MobileNav.tsx` links to `/meals`, `/receipts`, `/caregiver`. These routes are stubs now; they activate when the tracks merge.

## Test coverage

- `family-schedule-reconciler/tests.ts` — 7 tests covering happy path, DISCUSS, fenced JSON, all invalid_input cases, budget_exceeded propagation
- `family-grocery-parser/tests.ts` — 7 tests covering parsing, compound splits, store matching, notes, error cases
- `tests/smoke.test.ts` — 7 new T2 tests covering RLS on captures/grocery_items/schedule_entries and skill contract exports

All 35 tests pass.

## POSTBUILD items

See `docs/POSTBUILD-T2.md` for deferred items including:
- Two-image calendar support
- Move-to-grocery from Organized
- Clear cart button
- Duty assignment by user_id (currently stores assignee name in `notes`)

## Merge notes for Fernando

1. No migration changes — all tables pre-existed
2. Merge order: T2 can merge independently, before or after other tracks
3. Once T3 merges, grocery items from meal planning appear in `/grocery` automatically
4. Once T3/T4/T5 merge, their nav links become functional
5. Run `npm run test` after merge to confirm all 35+ tests still pass

T2 complete.
