\# POSTBUILD-T1 — Known debt from T1 (v0.1.0-foundation)



Non-blocking items discovered during T1 smoke testing. Address before v0.2.0 ships.



\## 1. Schema-only-on-remote



The `/supabase/migrations/` folder doesn't exist locally. All 7 migrations (001 through 007) live only in the remote Supabase database.



\*\*Impact:\*\* Not reproducible from repo alone. If spinning up a new Supabase branch or staging env, `supabase db push` has nothing to push.



\*\*Fix:\*\* `npx supabase db pull --linked` will dump the current schema as a consolidated migration file. Run once, commit the result, future migrations go through `supabase db diff → migration file → db push`.



\*\*Priority:\*\* Medium. Not blocking until we add a second environment.



\## 2. Next.js 16 deprecation warnings



Dev server emits three warnings on every start:

\- `middleware.ts` should be renamed to `proxy.ts` (Next.js 16 rename)

\- Sentry `disableLogger` deprecated → use `webpack.treeshake.removeDebugLogging`

\- Sentry `automaticVercelMonitors` deprecated → use `webpack.automaticVercelMonitors`



\*\*Fix:\*\*

\- Rename `middleware.ts` → `proxy.ts` and update any imports. Verify middleware still runs correctly.

\- Update `next.config.ts` Sentry options per the new config surface.



\*\*Priority:\*\* Low. All three are warnings; nothing breaks. Address in a dedicated "Next.js 16 hygiene" PR.



\## 3. LLM JSON fence-stripping made a shared helper



`skills/\_lib/parse.ts` was added reactively when Haiku 4.5 wrapped JSON in markdown fences despite prompt instructions. Every future JSON-returning skill MUST use `parseJsonResponse()` from this helper, not raw `JSON.parse()`.



\*\*Followup:\*\* Bake this into the T2–T8 track prompts so future skills use it from the start.



\## 4. Dashboard spend display precision



Current code: `((Number(spendCents ?? 0)) / 100).toFixed(2)`. Since Haiku calls cost <1 cent, dashboard shows `$0.00` for single calls.



\*\*Fix:\*\* Show `<$0.01` when actual spend < 0.5 cents, OR show cents with 3 decimals (`$0.013`) to make usage visible. UX call — defer to T6 dashboard polish.



\## 5. Dev-only test-skill route was under `\_dev/`



Next.js App Router treats `\_dev/` as private (not routable). Renamed to `dev/` with runtime NODE\_ENV gate still enforcing dev-only access.



\*\*No action\*\* — noted here so future routes know the convention.

