# Migrations

One file. That is deliberate.

```
20260907150000_baseline_production_schema.sql   the whole schema, as of 2026-09-07
ledger.json                                     what production's ledger should hold
archive/                                        ten superseded deltas, never replayed
```

## Why there is a baseline and not a history

Until 2026-09-07 this repository could not rebuild the database. Production had
57 tables and not one of them was created by anything here. The ten files that
used to sit in this directory were all deltas — `ALTER`, backfill, function
replacement — against a schema that existed only on the server. `git log`
confirms no file creating `families`, `users`, `kids`, `recipes` or `baby_events`
was ever committed.

So the problem was never the three ledger rows with no file. Replaying the whole
directory into an empty database failed on statement 0 of the first file:

```
ERROR: relation "public.api_usage" does not exist (SQLSTATE 42P01)
```

Supabase's own branching reached the same verdict independently, returning
`MIGRATIONS_FAILED` when it replayed `main` into a fresh project.

The missing piece was the genesis, and the only honest source for it was
production. The baseline is a `supabase db dump --schema public` of it, plus the
two things that dump cannot see: `pg_trgm` (installed in `public` here, not the
usual `extensions`) and the `family-documents` storage bucket with its four
policies. It is schema only — zero `INSERT`, zero `COPY` — so no family data is
in this repository.

## `archive/`

The ten superseded deltas, kept because they record *why* things are shaped the
way they are and a couple contain reasoning worth reading. The CLI does not
recurse into subdirectories, so they are never replayed. Do not move them back.

Three migrations that production's ledger records have no file even in the
archive, because none was ever written: `memory_foundation`,
`whats_due_and_chore_anchor` and `baby_lane_trunk`. Their effects are in the
baseline. Nothing is lost except the narrative.

## Adding a migration

```bash
npx supabase migration new some_change     # full 14-digit timestamp, always
$EDITOR supabase/migrations/<version>_some_change.sql
```

Then, in the **same commit**, add the version to `ledger.json`. The offline drift
check compares the two and fails the build if they disagree.

## After applying anything to production

Especially through MCP `apply_migration`, which writes the ledger and has no idea
whether a file exists — the reason `baby_lane_trunk` went unnoticed for months:

```bash
npm run migrations:verify:live
```

`npm run migrations:verify` (offline, no credentials, runs on every pull request)
checks version format, collisions, ordering, and files against `ledger.json`. It
cannot see production. Only the live form can.

## Rebuilding from scratch

```bash
npx supabase db reset                    # local
npx supabase db push --db-url <target>   # a branch or a fresh project
```

This has been done and the result diffed against production: byte-identical,
both locally and on a real Supabase project. See `docs/MIGRATION-REPAIR.md`.

Schema only. Restoring the family's **data** is a separate problem and this
directory does not solve it.
