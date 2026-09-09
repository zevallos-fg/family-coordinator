# Tech Debt — Family Coordinator v20
*Logged by autonomous build — 2026-04-18*

## Architecture
- **Modularization**: single-file HTML (v8.4 pattern) works for current scope. At ~150KB+ it's approaching maintainability limits. Component extraction to separate files + a build step would help. Trigger: next major feature addition.
- **State management**: ad-hoc useState + prop drilling. When v20 is stable, consider useContext or Zustand for shared state (recipes, pantry, ingredients). Not needed yet — current prop chain is traceable.
- **Apps Script row-per-record vs blob**: v8.4 sheets use JSON blobs in A1; v20 sheets use row-per-record. Two storage paradigms in one spreadsheet. Acceptable for now; unify if migrating to Supabase.

## Features deferred from v20 scope
- **Tasks/Digests/Documents/Maintenance/MealLog/PersonNutritionTarget UX** — stubs with headers only. Schema exists; no UI.
- **Calorie tracking UX** — nutrition data collected (barcode, USDA future, OPEN FoodFacts). Daily/weekly totals not surfaced.
- **Structured per-step recipe timing** — methodSteps is prose. Per-step timing deferred.
- **Voice recipe capture** — Mental Dump can catch meal ideas; recipe creation via voice deferred.
- **Costco PDF receipts** — explicitly out of scope (§3g). Requires PDF parsing.
- **Pregnancy-stage dietary filters UX** — dietaryTags schema ready; filter UI not built.
- **Pantry-driven recipe suggestions UX** — schema ready (can query pantry + RecipeIngredients); UI not built.
- **Restaurant/eating-out capture** — no flow exists.
- **Family recipe guided entry (Yenny's memory)** — oral history capture deferred.
- **Full automated recipe-notes summarization** — lite notes appended; auto-summarize to "current best version" deferred.

## Technical gaps
- **Recipe image dragnet to Drive**: `uploadBinary()` is in Apps Script but the v20 Add Recipe flow doesn't call it. Image is sent to Haiku for extraction but not archived to Drive. Fix: after Haiku returns, call Apps Script `uploadBinary` and store Drive file ID on Recipe.sourceImage.
- **Barcode Haiku vision fallback**: `/extract-barcode-wrapper` endpoint deployed but not triggered in current barcode flow (no product image available from barcode decode alone). To complete: add "Scan package" step in barcode flow that takes a photo of the wrapper when Open Food Facts returns nothing.
- **Grocery projection deduplication**: when a recipe is assigned to a meal slot, its ingredients are added to grocery list without checking for duplicates. Add dedup by ingredientId on projection.
- **Meal plan slot "undo cooked"**: no reverse path from cooked→planned. Add long-press or swipe-to-undo.
- **appsscript.json filename**: file is `appsscript.json` (correct per clasp). Legacy comment in build prompt said filename missing `.json` extension — not accurate, file is correct. Resolved.
- **Apps Script legacy `action === "anthropic"` branch**: removed in v20 Code.gs. Confirmed before next deploy.

## Testing
- **No automated tests** — Playwright E2E suite deferred. Manual test checklist in HANDOFF.md §21b.
- **No unit tests for rotation engine** — pure function, easy to test. Add when test infrastructure exists.

## Performance
- **Babel standalone compilation**: ~1-2s parse time on first load for 153KB file. Acceptable; replace with pre-compiled build if it grows past 250KB.
- **v20 poll interval**: 30s for new sheets. May feel slow if two users are editing simultaneously. Consider event-driven invalidation when moving to Supabase.

## Legitimate test skips

These `it.skip` entries are intentional — they cover stub skills not yet implemented.
Each has a SKIP-REASON comment in the test file.

| Skip location | Skip reason | Ticket | Un-skip when |
|---|---|---|---|
| `skills/family-blind-spot-detector/tests.ts` | Skill is a placeholder stub with no business logic | T6 | T6 scheduled and skill implemented |
| `skills/family-caregiver-employment/tests.ts` | Skill is a placeholder stub with no business logic | T8 | T8 scheduled and skill implemented |

## v34.0.0 — P0

**family-school-brief — removed.** Skill stub deleted in v34 P0. No schema for school newsletters. Revisit when school inbox triage becomes priority.

## v34.0.0 — Session B deferrals

### Composition opportunities (deferred to v35+)
- Receipts → Expenses auto-conversion
- Trips → Document Vault attachment
- Vendors → Maintenance auto-prompt

### Visual / design polish
- Each v34 feature shipped with minimal-functional UX
- No animations or advanced affordances
- Dedicated UX session needed

### Killed entirely
- family-school-brief: removed in v34 P0. Revisit when school inbox becomes priority.

## Future migration path
- **Supabase / Postgres**: when Google Sheets limits bind (~5M cells). Schema is designed for relational migration. Apps Script `weeklyBackup()` provides JSON snapshot for migration. All IDs are UUIDs.
- **Obsidian integration**: for long-form/narrative content (family memory, decision log). Explicitly a separate system — not a v20 concern.

## Auth / onboarding

- **Onboarding has no sign-out — a wrong-account login strands the user.** `app/onboarding/page.tsx`
  redirects to `/login` when there is no user and to `/dashboard` when a membership exists, so anyone
  signed in *without* a family lands on "create a household" with no way out. Sign-out is only rendered
  by `components/nav/TopNav.tsx:134` and `components/nav/MobileNav.tsx:74`, both of which live in the
  `(app)` route group; `/onboarding` sits outside that group and so renders no nav at all. The
  `POST /api/auth/signout` route exists and works — nothing on the page links to it.

  Consequence: signing in with the wrong email (a personal address instead of the family one, or a typo
  that created a fresh auth user) offers exactly one action — create a household. One wrong tap and the
  account owns an orphan family that nobody else is a member of, and the only route out is clearing
  cookies or an admin deleting the row.

  Fix: render a sign-out control on `/onboarding` — a form posting to `/api/auth/signout`, plus the
  signed-in email so the mistake is visible before the tap. Cheap; no schema change.

## Process and tooling

- **Merging a stacked PR's parent with `--delete-branch` closes the child, irrecoverably.**
  GitHub auto-closes any pull request whose base branch is deleted, and a closed PR whose base no
  longer exists cannot be reopened or retargeted — `reopenPullRequest` fails with *"Could not open
  the pull request"*, and `updatePullRequest` with *"Cannot change the base branch of a closed pull
  request"*. The PR number, its review thread, and its comments are gone.

  Hit on 2026-09-07 merging #19 → #20 → #21. #19 was squash-merged with `--delete-branch`; #20 was
  based on `fix/ci-that-can-see` and closed the instant that branch went. #20 no longer exists.

  Recovery, which is what was done: rebase the child onto `main` with the parent's commits dropped
  (`git rebase --onto main <parent-tip> <child-branch>`), force-push, and open a **new** PR carrying
  the old body over, with a comment on the closed one pointing at its replacement. #20 became #22.

  Prevention, in order of preference: retarget the child to `main` *before* merging the parent
  (`gh pr edit <child> --base main`), which works while the child is still open; or merge the parent
  without `--delete-branch` and clean up afterwards. Squash-merging a parent also means the child's
  copies of the parent's commits will not match, so a rebase is needed regardless — the `--onto` form
  above is the one that does not produce conflicts.

- **Playwright `workers` must stay at 3. Raising it will look exactly like flake.**
  `playwright.config.ts` pins `workers: 3` and `retries: 0`. The default is half the CPU count, which
  on a 16-core machine is 8.

  Measured 2026-09-07, full suite, `retries: 0`, against a server whose build id was verified against
  `.next/BUILD_ID`:

  | workers | result |
  |---|---|
  | 8 (default) | 5–8 failures, **a different set on each run** |
  | 4 | 1 failure |
  | 3 | 174/174, three consecutive runs |

  Every one of those failures passed in isolation, and the shifting set was the tell: this is a
  capacity ceiling, not a set of bugs. The system under test is **one `next start` process** talking
  to **one hosted Supabase** with **one shared fixture family** in it, and none of that scales with
  the number of cores the test runner happens to have. Eight workers is a load test with functional
  assertions bolted on — sixteen pages rendered at once, each making several sequential round trips
  to a database in another region.

  The trap: someone reads "5 failures, different every time", concludes the suite is flaky, and
  either raises `retries` or is told the tests are unreliable. Both hide it. If this suite goes red,
  it is a real failure.

  Whether a dedicated CI database would lift the ceiling is unknown and probably no — the constraint
  looks like the Node process, not the database. The experiment is one command
  (`--workers=8` against a CI database) and is written up in `docs/CI-DATABASE-SCOPE.md` §5.

- **A vendor key was rotated out from under us and nothing noticed for 141 days.**

  Here is the whole month in two strings. Both are `api_usage.error_message`, both describe the same
  broken key, and they are eight hours apart on 2026-09-07:

  ```
  upstream returned no completion (0 input tokens): API key is invalid.
  anthropic upstream error 401: API key is invalid.
  ```

  The first is a failure **deduced from an empty success**. The Worker returned HTTP 200 wrapping
  Anthropic's error body, so `response.ok` was true and the only clue was that a call which claimed
  to succeed had somehow used zero tokens. The second is a failure that **arrived as one**.

  Everything else here follows from that difference. If a broken thing answers 200, the only
  detector you can build is "this success looks wrong", and nobody builds those. 52 of the 81 rows in
  `api_usage` are the first kind.

  **What happened:** on 2026-04-20 a vendor security incident required rotating all Anthropic API
  keys. Family Coordinator was not on the list of things to update, so the Worker went on presenting
  a key that had been revoked underneath it. Every skill call from **2026-04-19 to 2026-09-06**
  failed. `usage.input_tokens ?? 0` read `0` off an error payload and a clean zero-token row landed
  in `api_usage` with `error_message` never set. The UI showed nothing — indistinguishable from
  nobody having used the feature.

  The loudness fixes are in (`skills/_lib/runner.test.ts` pins them, and Gate D re-proved them
  against the deployed Worker on 2026-09-07). What is *not* fixed is the thing that let it happen:
  **there was no list of external credentials, so this project could not be on anyone's rotation
  list.** Here is the list. Keep it current.

  | credential | lives in | who rotates it | breaks what, how loudly |
  |---|---|---|---|
  | `ANTHROPIC_KEY` | Worker `aged-dust-551a` secret | **vendor-driven — the one that caused this** | all 23 skills; now a non-200 with `X-Upstream-Error` and a populated `api_usage.error_message` |
  | `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel env | Supabase dashboard, manual | e2e fixture setup, `link-user.mjs`. Never in Actions, never in a Worker |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, Vercel, GitHub Actions, Worker `familyco-mcp` secret | Supabase dashboard, manual | everything. A wrong value surfaces as `401 {"message":"Invalid API key"}` — see the `familyId` PR for how badly that used to read |
  | `CONNECTOR_TOKEN_MAP` | Worker `familyco-mcp` secret | us, per person | the Claude.ai connector. Write-only in Cloudflare — it cannot be read back, only tested by calling |
  | Supabase refresh tokens | Worker `familyco-mcp` KV, `refresh:<uuid>` | rotate on every use; revoked by signing the user out | one person's connector |
  | `CLOUDFLARE_API_TOKEN` | 1Password, injected by `op run --env-file=.env.op` | us | all deploys. Scoped to Workers Scripts:Edit + Workers KV Storage:Edit on one account |
  | Supabase DB password | Supabase dashboard, cached by the CLI | Supabase dashboard, manual | `supabase db pull/push/dump` |
  | `SENTRY_AUTH_TOKEN` | `.env.local`, Vercel | Sentry, manual | source-map upload at build time only |
  | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN` | `.env.local`, Vercel | PostHog / Sentry | analytics and error reporting. Public by design |
  | `USDA_FDC_KEY` | Worker secret — **not set** | us, if ever | nothing; the barcode chain skips USDA until it exists |

  Two that deliberately do not exist and must not be created: `SUPABASE_JWT_SECRET` anywhere (it
  could sign `role:"service_role"` and bypass RLS entirely), and `SUPABASE_SERVICE_ROLE_KEY` in
  GitHub Actions (public repo, real family data).

- **"Merged" and "deployed" are different states, and nothing was checking the gap.**
  `worker/wrangler.toml` carried `id = "REPLACE_WITH_KV_NAMESPACE_ID"` from the hardening PR onward.
  The `RATE_LIMIT` namespace was never created, so `wrangler deploy` could not succeed, so **the auth
  gate that PR added was never deployed**. The fix was written, reviewed, merged, and not running.
  Everyone believed it was live, including the assistant that wrote it.

  What was actually serving on 2026-09-07, verified by request:

  ```
  POST https://aged-dust-551a.zevallos-fg.workers.dev/    (no Authorization header)
  HTTP/1.1 200 OK
  {"type":"error","error":{"type":"invalid_request_error","message":"model: Field required"},
   "request_id":"req_011CepiAbARQN4PNyjMTNPDG"}
  ```

  No 401, no `WWW-Authenticate`, and an Anthropic `request_id` — an unauthenticated stranger's request
  forwarded upstream on our key. `invalid_request_error` rather than `authentication_error` means
  Anthropic **accepted the credential** and rejected only the body shape.

  The vulnerability was dormant for 141 days for the worst possible reason: an open proxy holding a
  revoked key spends nothing. **The dead key was the only thing protecting it.** Setting a working
  key on 2026-09-07 is what armed it, and the exposure ran hours, not months.

  The smallest check that closes this: **grep for `REPLACE_WITH_` in the repository and fail the
  build.** One line, no credentials, catches this exact class the day it is introduced.

  ```yaml
  - name: No placeholders in deployable config
    run: |
      if grep -rn "REPLACE_WITH_" --include="*.toml" --include="*.json" --include="*.yml" .; then
        echo "::error::placeholder left in config — something merged that cannot deploy"
        exit 1
      fi
  ```

  That catches placeholders, not staleness. The larger version — asserting that what is deployed
  matches `main` — is real work and is not done. A cheap approximation already exists and was used
  here: `GET /health` returned 405 before the deploy and 200 after, because the route only exists in
  the new code. A deployed build id, checked against the merge commit, is the honest version.

- **A debug probe printed a live connector token into Cloudflare's logs in cleartext.**
  Removed 2026-09-08. Recorded because the shape of the mistake is more instructive than the fix.

  The MCP worker's temporary auth probe logged `authz.split(" ")[0]` as "the scheme". That is correct
  for `Authorization: Bearer <token>`, and it is the **entire credential** for a header sent without
  a scheme — which is exactly what Claude.ai sends. So the one client whose behaviour the probe
  existed to investigate was the one client whose token it printed.

  The probe was written to be safe: it fingerprinted the credential with SHA-256 precisely so a token
  would never be logged. What defeated that was not the fingerprinting but an assumption **upstream**
  of it — that the header had a scheme at all. A field that is safe under the expected input and
  catastrophic under the unexpected one is not a safe field, and the unexpected input is the reason
  a debug probe is being written in the first place.

  Two consequences worth keeping:

  - Fernando's connector token had to be rotated. Cloudflare's log retention means "delete the log"
    is not a remedy; the only remedy is a new token.
  - It was this bug that made the real one legible. The scheme-less header showed up in the logs as a
    43-character "scheme", which is what identified the missing `Bearer ` prefix after four wrong
    hypotheses. The leak and the diagnosis were the same line of code.

  The worker now logs status, byte count and latency, and reads the Authorization header in exactly
  one place: the gate that authenticates it. Nothing logs any part of that header, in any form,
  fingerprinted or otherwise.

- **Two writers kept one fact, and the fact drifted.** Resolved 2026-09-08 by moving connector
  tokens into KV; recorded because the failure was structural, not careless.

  `link-user.mjs` linked a user in two halves. It wrote the refresh token to KV **itself**, and it
  *printed* the connector-token map entry for a human to set as a Worker secret. One half could not
  be forgotten; the other was a manual step in a console scroll-back. Run the script twice, apply
  the map once, and a family member holds a correctly formed token the gate has never heard of.

  That is exactly what happened. Yenny's token was 43 valid base64url characters, indistinguishable
  by eye from a real one, and 401'd — because a second run had minted it while the map still held
  the first. Two evenings were lost between the two halves of this: one to the missing `Bearer `
  prefix, one to this.

  The tempting fix was to put the token she held into the map. It would have worked. It would also
  have made a string of unverifiable origin into a live credential for a real family's data on the
  strength of its **length** — and shape is not provenance. The right question was not "is this
  token valid?" but "can I establish where it came from?", and the answer was no.

  Fixed by deleting the manual half rather than automating it: KV holds `token:<sha256>` → user id,
  and `link-user.mjs` writes it. One writer. Re-minting now also revokes the previous token, which
  the map did implicitly by being rewritten wholesale and KV does not — a reverse index,
  `tokenkey:<uuid>`, exists solely so that revocation does not require scanning the namespace.

  The general lesson, worth more than the specific fix: **if a single fact is maintained in two
  places by two different mechanisms, one automatic and one manual, it will drift, and the drift
  will surface as an authentication failure nobody can explain.** Prefer deleting a writer to
  synchronising two.
