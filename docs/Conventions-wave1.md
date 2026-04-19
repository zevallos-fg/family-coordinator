# Wave 1 Conventions

Four Claude Code sessions run in parallel. This doc prevents them from stepping on each other. Every prompt tells each track to read this first.

---

## File ownership map

### READ-ONLY for all four tracks (shared T1 infrastructure)

These files were built in T1. Do not modify unless you are specifically instructed in your track prompt.

- `lib/supabase/admin.ts` — service-role client (ops-only)
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server client
- `lib/supabase/database.types.ts` — auto-generated; only modified via `supabase gen types`
- `lib/skill-action.ts` — `withSkillContext()` helper
- `lib/analytics.ts` — PostHog `track()` function
- `skills/_lib/runner.ts` — `callSkill()` framework function (patched in Phase 0 for vision support)
- `skills/_lib/types.ts` — skill type contracts
- `skills/_lib/parse.ts` — `extractJson` and `parseJsonResponse` helpers
- `skills/family-capture-router/*` — T1's first implemented skill; already works
- `components/ui/button.tsx` — shared Button primitive
- `components/ui/input.tsx` — shared Input primitive
- `app/(auth)/login/page.tsx` — auth entry point
- `app/api/auth/*` — OAuth callback, ensure-user, signout
- `app/onboarding/*` — family creation wizard
- `app/invite/*` — invite acceptance
- `app/api/dev/test-skill/route.ts` — dev-only smoke route
- `middleware.ts` — session refresh middleware (T2 may rename to `proxy.ts` per POSTBUILD)
- `next.config.ts` — Sentry-wrapped config
- `sentry.*.config.ts` — Sentry SDK configs
- `package.json`, `package-lock.json` — **EXCEPT T4 may add `html5-qrcode`**
- Any skill folder you don't own

### Track ownership

**T2 owns:**
- `app/(app)/schedule/*` — Schedule tab (full port from v8.4)
- `app/(app)/capture/*` — Mental Dump tab
- `app/(app)/organized/*` — Organized tab (categorized view)
- `app/(app)/grocery/*` — Grocery tab (reads T3's `grocery_items`)
- `app/(app)/dashboard/page.tsx` — rebuild from placeholder into real dashboard
- `components/nav/*` — top navigation, app shell
- `components/schedule/*`, `components/capture/*`, `components/organized/*`, `components/grocery/*`
- `skills/family-grocery-parser/*`
- `skills/family-schedule-reconciler/*`
- `app/api/dev/seed-demo/route.ts` — optional dev-only data seeder for testing

**T3 owns:**
- `app/(app)/meals/*` — Meal planning area (all three tabs: Recipes, Pantry, Plan)
- `components/meals/*` — all meal-related components
- `skills/family-recipe-importer/*`
- `skills/family-meal-planner/*`
- `docs/CONVENTIONS-grocery.md` — the convention for how meal-plan grocery deltas integrate with T2's grocery tab

**T4 owns:**
- `app/(app)/receipts/*` — receipt scanning and history
- `app/(app)/barcode/*` — barcode scanner
- `components/receipt/*`, `components/barcode/*`
- `skills/family-receipt-parser/*`
- `skills/family-pantry-inference/*`
- `package.json` — **may add `html5-qrcode` dependency** (the only track allowed to modify package.json)

**T5 owns:**
- `app/(app)/caregiver/*` — Caregiver Hub (morning brief, recap, kid state)
- `components/caregiver/*`, `components/kid-state/*`
- `skills/family-caregiver-brief/*`
- `skills/family-caregiver-recap/*`
- `skills/family-kid-state/*`

---

## Navigation coordination (T2's responsibility)

T2 builds the top nav / app shell. It adds route links for ALL FOUR tracks even though T3/T4/T5 build their own pages. T2's nav will have:

- Dashboard (T1, rebuilt by T2)
- Schedule (T2)
- Capture / Mental Dump (T2)
- Organized (T2)
- Grocery (T2)
- Meals (T3 — link from T2's nav)
- Receipts (T4 — link from T2's nav)
- Caregiver (T5 — link from T2's nav)

Each non-T2 track defines its pages at the expected route path (`/meals`, `/receipts`, `/caregiver`). When tracks merge to main in Phase 2, the links work automatically.

**Nav should be responsive** — collapse to hamburger on mobile, show full nav on desktop.

---

## UI component naming

Never create a component with the same name as another track's component. Use feature-scoped folders:

- `components/schedule/ScheduleCard.tsx` — not `components/ui/ScheduleCard.tsx`
- `components/meals/RecipeCard.tsx` — not `components/ui/RecipeCard.tsx`
- `components/receipt/ReceiptPhoto.tsx`
- `components/caregiver/BriefCard.tsx`

If you find yourself needing a truly shared primitive (e.g. Card, Dialog, Toggle), that's a POSTBUILD item — log to `docs/POSTBUILD-T{n}.md` with a suggested component contract and move on. Don't add to `components/ui/` in Wave 1.

---

## Server Action naming

Each track uses route-scoped Server Action files:

- T2: `app/(app)/schedule/actions.ts`, `app/(app)/capture/actions.ts`, etc.
- T3: `app/(app)/meals/actions.ts` (shared across recipe/pantry/plan)
- T4: `app/(app)/receipts/actions.ts`, `app/(app)/barcode/actions.ts`
- T5: `app/(app)/caregiver/actions.ts`

Never put Server Actions in a shared `/lib/` location. Route-scoping prevents name collisions.

---

## Skill invocation patterns

All skills must go through `withSkillContext()` from `lib/skill-action.ts`. Never import and call a skill's `run()` directly from a component or route handler.

**Correct:**
```typescript
import { withSkillContext } from "@/lib/skill-action";
import * as mealPlanner from "@/skills/family-meal-planner";

const result = await withSkillContext(mealPlanner.run, {
  recipes: [...],
  pantry: [...],
  preferences: {...},
});
```

**Wrong:**
```typescript
import { run } from "@/skills/family-meal-planner";
const ctx = { familyId: "...", userId: "..." }; // manual context = security bug waiting
await run(input, ctx);
```

---

## JSON parsing from LLM responses

Always use `parseJsonResponse()` from `skills/_lib/parse.ts`. Never raw `JSON.parse(result.data)`. This helper handles markdown fence wrapping (which Haiku and Sonnet both do despite prompt instructions).

```typescript
import { parseJsonResponse } from "../_lib/parse";
// ...
const parsed = schema.parse(parseJsonResponse(result.data));
```

---

## Branch naming

- `wave1/t2-v8-port`
- `wave1/t3-meal-planning`
- `wave1/t4-vision-barcode`
- `wave1/t5-caregiver-hub`

Never force-push. Never rebase onto main while running. All merges to main happen in Phase 2 by Fernando manually.

---

## Commit cadence

- **Commit every 30 minutes minimum.** Even partial work.
- **Push after every commit.** Progress must be visible from the main repo.
- **Commit messages follow Conventional Commits:** `feat(T3): implement family-meal-planner skill`, `fix(T3): handle empty pantry case`, `chore(T3): log deferred UI polish to POSTBUILD`.
- **If stuck >15 min, commit with message `wip: [description]` and continue.** Don't block.

---

## Database convention

**No new migrations in Wave 1.** All 43 tables exist. All 7 RPC functions exist. If your track discovers a schema gap, log to `docs/POSTBUILD-T{n}.md` and work around it.

If you need to query something your current types don't support, it's because types weren't regenerated after migration 008. Run `npx supabase gen types typescript --project-id pmficrajnyeuworrqytn > lib\supabase\database.types.ts` at the start of your session. This is the only exception to "lib/supabase/database.types.ts is read-only."

---

## The default family for testing

Family `Zevallos` (id `7d0c3888-16c8-4144-b088-428f38a7e93a`) has:
- 10 default categories (seeded via migration 008)
- 5 default stores (Publix, Winn-Dixie, Costco, Whole Foods, Target)
- Fernando as owner (user ID `a4b2af94-06f5-4a25-b84f-aecb89da9191`)

Use these IDs when writing seed data or test fixtures in your track.

---

## Skills catalog reference

Full list at `skills/README.md`. Each track should reference this when implementing new skills — the table at the bottom lists what's available, which tier to use, and who owns it.

---

## When your track is done

Write `docs/T{n}-COMPLETE.md` with:
- What shipped (feature list)
- What's stubbed (log per skill)
- What's deferred (link to POSTBUILD)
- What depends on other tracks (e.g. "T2 grocery tab is empty until T3 populates grocery_items")
- Merge notes for Fernando (any order dependencies, any manual steps)

Final commit message should include the phrase "T{n} complete" so Fernando can `git log` for the finish flag in the morning.
