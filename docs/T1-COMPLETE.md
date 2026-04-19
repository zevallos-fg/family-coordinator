# T1 (Foundation) — Complete

**Tag:** v0.1.0-foundation
**Date:** April 18, 2026

## Shipped

### Auth + Tenancy
- Google OAuth + magic link login (`app/(auth)/login/page.tsx`)
- OAuth callback with session exchange + user upsert (`app/api/auth/callback/route.ts`)
- User row auto-upsert on sign-in (`app/api/auth/ensure-user/route.ts`)
- Family creation wizard + partner invite flow (`app/onboarding/`)
- Invite acceptance with expiry + duplicate-membership guard (`app/invite/[token]/page.tsx`)
- Sign-out route (`app/api/auth/signout/route.ts`)
- Dashboard with live skill-spend indicator (`app/(app)/dashboard/page.tsx`)
- Root redirect based on auth + onboarding state (`app/page.tsx`)

### Skills framework
- 22 skill folders scaffolded (`skills/`)
- `callSkill()` runner with RPC-based budget enforcement + PostHog events (`skills/_lib/runner.ts`)
- `withSkillContext()` Server Action helper — auto-derives family/user from session (`lib/skill-action.ts`)
- **`family-capture-router` skill fully implemented** — first live skill, proven end-to-end
- Dev-only smoke route at `/api/_dev/test-skill` (disabled in production)

### Observability
- Sentry error tracking with PII scrubbing (`sentry.server.config.ts`)
- PostHog client analytics via `PostHogProvider` (`components/providers/posthog-provider.tsx`)
- `track()` helper for client-side events (`lib/analytics.ts`)
- `skill.invoked` server-side PostHog events on every skill call

### Infrastructure
- Sonner toast notifications in root layout
- `Button` and `Input` UI components (`components/ui/`)
- Vitest configured with `.env.local` loading + `server-only` alias

### Database
- 43 tables, 170 RLS policies, 4 helper functions
- Migrations 001–006 locked — no modifications in T1
- Two SECURITY DEFINER RPCs: `fn_skill_get_monthly_spend`, `fn_skill_record_usage`
- Service role key restricted to `lib/supabase/admin.ts` (ops-only path)

### Testing
- 13 tests passing (6 unit + 7 integration smoke)
- `family-capture-router` unit tests: valid input, empty text, whitespace, malformed JSON, wrong shape, budget_exceeded propagation
- T1 smoke tests: database contract (RLS enforcement), skill framework shape

## Stubbed

- 21 skills still have placeholder `index.ts`
- Dashboard shows family name + spend only (T2 rebuilds as real dashboard)

## Deferred

- Cloudflare Worker budget-check update (planned post-T1 via wrangler)
- Full RLS cross-user tests (T9)
- Email delivery for invites (T9)

## Next tracks (Wave 1)

Ready to generate:
- T2: v8.4 port (Schedule, Mental Dump, Organized, Grocery)
- T3: v20 meal planning (Recipes, Pantry, MealPlan)
- T4: v20 vision/barcode (Receipt, Barcode)
- T5: v21 Caregiver Hub

## Pause points requiring Fernando

### Step 21c — Local smoke test
Start `npm run dev`, then:
1. Sign in at `http://localhost:3000/login`
2. Complete onboarding (create family, skip invite)
3. Visit `http://localhost:3000/api/_dev/test-skill`
4. Confirm JSON response has `ok: true` and `groceryItems` with oregano/chili powder/paper towels
5. Check Supabase dashboard → `api_usage` table for new row

### Step 22b — Vercel deploy
Go to https://vercel.com/new, import `family-coordinator` repo. Add env vars from `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_WORKER_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

Click Deploy. Share the production URL.

### Step 22c — Google OAuth update
Update Google OAuth Authorized Redirect URIs to include `https://{vercel-url}/api/auth/callback`.




---

## Production smoke — verified April 19, 2026 02:56 UTC

- Production URL: https://family-coordinator.vercel.app
- Google OAuth flow: ✓
- Supabase Auth URL allowlist: ✓
- Dashboard render with live skill-spend RPC: ✓
- Session cookies working through Vercel's edge network: ✓

**Database reconciliation post-deploy:**
- 1 family (Zevallos)
- 1 family_members (owner)
- 1 public.users row
- 3 api_usage rows from local smoke testing
- Total spend: $0.000378 (3 × $0.000126 per capture-router call)

**Known follow-ups logged:** `docs/POSTBUILD-T1.md`

**Tag:** v0.1.0-foundation points at commit 55b5836.

T1 is production-verified. Wave 1 (T2, T3, T4, T5) unblocked.








