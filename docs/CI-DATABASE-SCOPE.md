# A dedicated database for CI — scope, cost, and the case against

**Status: scoping only. Nothing here is built.**

Written 2026-09-07, after the e2e suite reached 174/174 at `retries: 0` and stopped
being the reason not to do this.

---

## The short version

**Recommendation: do not build it yet, and possibly not at all.**

Not because it is expensive — it is very cheap. Because **the repository cannot
currently rebuild the production schema**, and a dedicated CI database is built by
replaying `supabase/migrations/`. Standing one up today would produce a database
that is missing the entire baby lane and then fail on the first migration that
assumes it.

That prerequisite is a bigger job than the database, and it is worth doing on its
own merits whether or not this ever happens.

The one thing a separate project genuinely buys — and it is not nothing — is that
it removes `SUPABASE_SERVICE_ROLE_KEY` from the decision entirely. Section 6.

---

## 1. Cost

Measured against this org (`gppkxzorcecxqpxertxd`, plan **pro**) rather than
assumed, via the Supabase management API:

| option | price | per month, realistically |
|---|---|---|
| **A second project** | **$10.00 / month**, flat | **$10.00** |
| **A preview branch** | **$0.01344 / hour**, while alive | **~$0.11** at 100 CI runs of ~5 min |
| | | ~$9.68 if ever left running |

Cost is not the deciding factor either way. But it does pick the *shape*: a branch
that exists only for the duration of a run is roughly a hundred times cheaper than
a project sitting idle, and it is also the more correct model — a fresh database
per run cannot accumulate state between runs, which is the failure mode the shared
fixture family is permanently one bug away from.

Branches are only cheap if they are torn down. A branch left alive by a cancelled
workflow costs the same as the project.

---

## 2. How schema syncs from production — and why it cannot, today

This is the blocker.

A Supabase branch is created by replaying `supabase/migrations/` against an empty
database. So the repository has to be able to reconstruct production. It cannot.

### 2a. Three applied migrations have no file in the repo

The ledger (`supabase_migrations.schema_migrations`) holds 8 entries. Three of them
correspond to no file:

| version | name | what it created |
|---|---|---|
| `20260902000000` | `memory_foundation` | — |
| `20260902010000` | `whats_due_and_chore_anchor` | `v_whats_due`, chore anchoring |
| `20260906000000` | **`baby_lane_trunk`** | **`baby_events`, `baby_predictions`, `baby_share_links`, `fn_baby_log`, `fn_baby_toggle`, `fn_share_*`, `v_baby_today`, `v_contractions_recent`** |

Verified: `grep -rl "baby_events" supabase/` returns nothing. **The entire baby lane
exists only in production.** A database built from this repo would not have it, and
`20260907_baby_day_window.sql` — which does `alter table families` and
`create or replace view v_baby_today` — would fail immediately against it.

### 2b. Five files are not in the ledger

`20260419_recipe_backfill_v0.2.1.sql`, `20260419_recipe_title_case_and_default_serves.sql`,
`20260425_v33_dragnet_backfill.sql`, `20260425_v33_grocery_upsert_function.sql`,
`20260425_v34_family_documents_bucket.sql`.

They may have been applied by hand, or never. Nothing in the repo or the database
records which.

### 2c. The version numbers collide

The Supabase CLI takes a migration's version from the digits before the first `_`
and requires them to be unique and ordered. Ours:

```
20260419  ×3      20260425  ×3      20260906  ×3      20260907  ×1
```

Ten files, four distinct versions. Only `20260419` appears in the ledger at all, and
three files claim it. The CLI cannot order these, and would treat almost all of them
as unapplied.

### What fixing it looks like

1. `supabase db dump --schema public` against production to get the true current
   schema.
2. Replace `supabase/migrations/` with a single squashed baseline at a timestamp
   later than everything in the ledger — `20260907999999_baseline.sql` — containing
   that dump.
3. Insert the matching ledger row in production so it is considered applied there.
4. Every future migration gets a 14-digit timestamp and goes through the same path.

That is a half-day of careful work with a dry run, and it is worth doing **whether
or not a CI database ever happens** — right now the repo cannot rebuild the product,
which is a restore-from-scratch problem, not just a testing one.

---

## 3. How migration drift is prevented afterwards

The drift above happened because migrations are applied straight to production via
MCP `apply_migration`, which writes the ledger but has no idea whether a file exists
in the repo. The two halves were never checked against each other.

The check is cheap and belongs in the `checks` CI job, which needs no credentials
for the file half but does for the ledger half — so it fits better as a script run
locally and in the e2e job:

```
for each row in supabase_migrations.schema_migrations
    assert a file exists whose version prefix equals row.version
for each file in supabase/migrations
    assert its version is unique and appears in the ledger
```

Failing loudly the first time the two disagree is the whole point. Had this existed,
`baby_lane_trunk` would have been caught the day it was applied.

**This is worth adding even if nothing else here is.**

---

## 4. How the fixture family moves

The easy part, and mostly already done.

`tests/e2e/global-setup.ts` already **creates** the fixture family rather than
assuming it: `findOrCreateUser`, `findOrCreateFamily`, `ensureMembership`, keyed on
`e2e+fixture@familyco.test` and `"E2E Fixture Family"`. Pointed at an empty database
it would build its own fixture on first run.

What would need to change:

- **`fixtureFamilyId()`** currently resolves by name against whatever database the
  env vars point at. No change needed — it follows the env.
- **The kid row.** Several specs create and delete their own kids; `baby-lane.spec.ts`
  does. Nothing depends on a pre-existing kid.
- **Seed data.** Nothing does. Every spec that needs rows creates them and wipes them.
  This is why the suite already runs against an empty fixture family in production.
- **The per-project tagging** (`E2E write path (chromium)` etc.) stays exactly as is;
  it guards against the two Playwright projects colliding, which is independent of
  which database they are in.

Estimated: a couple of hours, most of it verifying rather than writing.

---

## 5. Would `workers: 3` still hold?

**Probably yes, and a dedicated database is unlikely to change it — because the
database is probably not the constraint.**

What was measured (full suite, `retries: 0`, verified-fresh server):

| workers | result |
|---|---|
| 8 | 5–8 failures, a different set each run |
| 4 | 1 failure |
| 3 | 174/174, three times |

The failures were page-load timeouts, and the system under test is **one
`next start` process** — a single Node server rendering every page, each of which
makes several sequential Supabase round trips. A separate database changes the
latency of those round trips slightly (a branch is in the same region) but does not
give the Node process more capacity.

This is worth an experiment rather than an argument, and the experiment is cheap:
once a CI database exists, run the suite at `--workers=8` against it. If it stays
green, the database was the constraint and `workers` can rise. If it fails the same
way, the Node server is, and the number stays at 3.

Note that CI runners have 2–4 cores, so Playwright's default there is already 1–2.
`workers: 3` costs nothing in CI; it only constrains local runs.

---

## 6. The case for not doing this — which may be the whole argument

The current arrangement is a fixture family inside the production project. It:

- has **never touched Zevallos data** — verified after every phase this week, by
  counting rows in both families;
- is **serialized** by `concurrency: e2e-fixture-family`, queued not cancelled;
- **creates and wipes its own rows**, scoped per Playwright project;
- and **works**, at 174/174.

Against that, a dedicated database buys:

| claimed benefit | honest assessment |
|---|---|
| Isolation from real data | Already achieved. The risk was never theoretical, but it has been closed by scoping and verified repeatedly. |
| Freedom to run destructive tests | Real, but we have not wanted to. No spec has been blocked by this. |
| Parallelism | Unproven — section 5. Likely the Node server, not the database. |
| Schema-change rehearsal | Real and currently unavailable. Would have caught nothing this week; the dry-run-and-rollback pattern already did. |
| **Removes `SUPABASE_SERVICE_ROLE_KEY` from the decision** | **This is the real one.** |

### The service-role key argument

The e2e suite cannot run in GitHub Actions today, because `global-setup.ts` needs the
admin API to create the fixture user, and that key bypasses RLS on the database
holding real family data — in a **public** repository. The refusal to put it there is
correct and should stand.

A dedicated CI database changes the *nature* of that key. Its service-role key
unlocks a database containing nothing but a synthetic fixture family. Leaking it
would be embarrassing, not harmful. At that point it goes into Actions secrets
without the argument, and the e2e job stops being skipped.

**So the question is not "is the fixture family safe?" — it is, demonstrably. The
question is "how much is it worth to run the e2e suite in CI?"**

Right now: less than the cost of the migration repair it depends on. The `checks`
job — typecheck, lint, 220+ unit tests — already gates every PR with no credentials
at all, and that is the check that catches most regressions. The e2e suite runs
locally, before every merge, and has done all week.

### Recommended order, if this ever happens

1. **Repair the migration history** (section 2). Do this regardless.
2. **Add the ledger/file drift check** (section 3). Do this regardless.
3. Only then decide about the database — and if so, prefer a **branch per run**
   over a second project, on cost and on freshness.

Steps 1 and 2 are the ones with value independent of this decision. If they are
done and the CI database still looks unattractive, that is a legitimate place to
stop.
