#!/usr/bin/env node
/**
 * Does the migrations directory still describe the database?
 *
 * It stopped describing it some time before 2026-09-07, and nothing noticed for
 * months. Three migrations were applied through MCP and recorded in production's
 * ledger with no file ever committed — one of them `baby_lane_trunk`, which is
 * the entire baby lane. Ten files collapsed to four versions, because the CLI
 * reads a migration's version from the digits before the first underscore and
 * `20260906_caregiver_share_tokens.sql` and `20260906_check_columns_to_enums.sql`
 * are both, as far as it is concerned, version `20260906`.
 *
 * The cause is that `apply_migration` writes the ledger and has no idea whether
 * a file exists. It is the same shape as the other things fixed this week: a
 * control that watches one half of a pair and reports healthy.
 *
 * Two modes, because the two halves need different things:
 *
 *   offline (default)  Everything provable from the repository alone: version
 *                      format, collisions, ordering, and agreement with the
 *                      committed ledger snapshot. No credentials, so it runs in
 *                      the `checks` job that gates every pull request.
 *
 *   --live             Additionally reads production's real ledger through the
 *                      Management API and compares it to both the files and the
 *                      snapshot. This is the half that catches a migration
 *                      applied through MCP, and it needs a credential, so it
 *                      cannot run in `checks`.
 *
 * Offline mode says out loud what it could not check. A check that hides its own
 * blind spot is how this started.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SNAPSHOT_PATH = join(MIGRATIONS_DIR, "ledger.json");

const LIVE = process.argv.includes("--live");

const problems = [];
const notes = [];
function fail(title, detail) {
  problems.push({ title, detail });
}

/**
 * How the Supabase CLI reads a version: the leading digits, stopping at the
 * first character that is not one. Deliberately duplicated here rather than
 * assuming the filename is well-formed, because detecting the malformed case is
 * the entire point.
 */
function versionOf(filename) {
  const match = /^\d+/.exec(filename);
  return match ? match[0] : null;
}

// ── The files ────────────────────────────────────────────────────────────────

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`No migrations directory at ${MIGRATIONS_DIR}`);
  process.exit(1);
}

// Top level only. Anything under archive/ is superseded history kept for
// provenance; the CLI does not recurse, so neither does this.
const files = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".sql"))
  .map((e) => e.name)
  .sort();

if (files.length === 0) {
  fail(
    "No migrations",
    "supabase/migrations/ contains no .sql files. The database cannot be rebuilt from this repository."
  );
}

// A full 14-digit timestamp, which is what `supabase migration new` generates.
// Short prefixes are what allowed ten files to become four versions.
const MIGRATION_NAME = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/;

for (const name of files) {
  if (MIGRATION_NAME.test(name)) continue;
  const version = versionOf(name);
  fail(
    `Malformed migration filename: ${name}`,
    version && version.length !== 14
      ? `The CLI will read this as version "${version}" (${version.length} digits, not 14). ` +
        `Two files whose digits agree become one version and one of them is silently never applied. ` +
        `Rename it to a full timestamp: <YYYYMMDDHHMMSS>_<lower_snake_name>.sql`
      : `Expected <YYYYMMDDHHMMSS>_<lower_snake_name>.sql`
  );
}

// Collisions: two files the CLI cannot tell apart.
const byVersion = new Map();
for (const name of files) {
  const version = versionOf(name);
  if (!version) continue;
  if (!byVersion.has(version)) byVersion.set(version, []);
  byVersion.get(version).push(name);
}
for (const [version, names] of byVersion) {
  if (names.length > 1) {
    fail(
      `Version collision on ${version}`,
      `${names.length} files resolve to the same version, so the CLI applies one and ignores the rest ` +
        `without saying so:\n    ${names.join("\n    ")}`
    );
  }
}

// Filename order must equal version order, or "the last migration" means two
// different things depending on who is asking.
const versions = files.map(versionOf).filter(Boolean);
const ascending = [...versions].sort();
if (versions.join(",") !== ascending.join(",")) {
  fail(
    "Filename order does not match version order",
    `Sorted by name: ${versions.join(", ")}\nSorted by version: ${ascending.join(", ")}`
  );
}

// ── The committed snapshot ───────────────────────────────────────────────────

let snapshot = null;
if (!existsSync(SNAPSHOT_PATH)) {
  fail(
    "Missing ledger snapshot",
    `Expected ${SNAPSHOT_PATH}. It records which versions production's ledger is ` +
      `expected to hold, so the offline check has something to compare files against.`
  );
} else {
  try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  } catch (err) {
    fail("Unreadable ledger snapshot", `${SNAPSHOT_PATH}: ${err.message}`);
  }
}

const snapshotVersions = Array.isArray(snapshot?.migrations)
  ? snapshot.migrations.map((m) => String(m.version))
  : null;

if (snapshot && !snapshotVersions) {
  fail("Malformed ledger snapshot", `${SNAPSHOT_PATH} has no "migrations" array.`);
}

if (snapshotVersions) {
  const fileSet = new Set(versions);
  const snapSet = new Set(snapshotVersions);

  const missingFiles = snapshotVersions.filter((v) => !fileSet.has(v));
  if (missingFiles.length > 0) {
    fail(
      "Ledger version with no file",
      `The snapshot expects these versions to exist as migration files, and they do not:\n    ` +
        missingFiles.join("\n    ") +
        `\nThis is the baby_lane_trunk shape: applied to the database, never committed.`
    );
  }

  const missingLedger = [...new Set(versions.filter((v) => !snapSet.has(v)))];
  if (missingLedger.length > 0) {
    fail(
      "File not in the ledger snapshot",
      `These migration files are not recorded in the snapshot:\n    ` +
        missingLedger.join("\n    ") +
        `\nEither the file was never applied, or the snapshot was not updated after applying it.`
    );
  }
}

// ── Production's real ledger ─────────────────────────────────────────────────

if (LIVE) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || snapshot?.project_ref;

  if (!token) {
    fail(
      "--live requires SUPABASE_ACCESS_TOKEN",
      "A Supabase Management API personal access token. Note this is not the " +
        "service-role key and grants no direct access to family data."
    );
  } else if (!ref) {
    fail("--live requires a project ref", 'Set SUPABASE_PROJECT_REF, or "project_ref" in the snapshot.');
  } else {
    const url = `https://api.supabase.com/v1/projects/${ref}/database/migrations`;
    let live;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        fail("Could not read the live ledger", `${url} -> ${res.status} ${res.statusText}`);
      } else {
        live = await res.json();
      }
    } catch (err) {
      fail("Could not reach the Management API", `${url}: ${err.message}`);
    }

    if (Array.isArray(live)) {
      const liveVersions = live.map((m) => String(m.version));
      const liveSet = new Set(liveVersions);
      const fileSet = new Set(versions);

      const appliedWithNoFile = liveVersions.filter((v) => !fileSet.has(v));
      if (appliedWithNoFile.length > 0) {
        const named = live
          .filter((m) => appliedWithNoFile.includes(String(m.version)))
          .map((m) => `${m.version}  ${m.name ?? "(unnamed)"}`);
        fail(
          "Applied to production, not in this repository",
          `Production's ledger records these migrations and no file exists for them:\n    ` +
            named.join("\n    ") +
            `\nThe database cannot be rebuilt from this repository while that is true.`
        );
      }

      const fileNotApplied = [...new Set(versions.filter((v) => !liveSet.has(v)))];
      if (fileNotApplied.length > 0) {
        fail(
          "In this repository, not applied to production",
          `These migration files have no row in production's ledger:\n    ` +
            fileNotApplied.join("\n    ") +
            `\nExpected on a pull request that adds a migration. Unexpected on main.`
        );
      }

      if (snapshotVersions && liveVersions.join(",") !== [...liveVersions].sort().join(",")) {
        notes.push("Production's ledger is not in ascending version order.");
      }
      if (snapshotVersions) {
        const snapSet = new Set(snapshotVersions);
        const drift = [
          ...liveVersions.filter((v) => !snapSet.has(v)).map((v) => `live only: ${v}`),
          ...snapshotVersions.filter((v) => !liveSet.has(v)).map((v) => `snapshot only: ${v}`),
        ];
        if (drift.length > 0) {
          fail(
            "Ledger snapshot is stale",
            `supabase/migrations/ledger.json disagrees with production:\n    ` + drift.join("\n    ")
          );
        }
      }
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const scope = LIVE ? "files, snapshot and production's live ledger" : "files and the committed snapshot";

if (problems.length > 0) {
  console.error(`\nMigration drift check FAILED — compared ${scope}.\n`);
  for (const [i, p] of problems.entries()) {
    console.error(`${i + 1}. ${p.title}`);
    console.error(`   ${p.detail.replace(/\n/g, "\n   ")}\n`);
  }
  process.exit(1);
}

console.log(`Migration drift check passed — compared ${scope}.`);
console.log(`  ${files.length} migration file(s): ${files.join(", ")}`);
for (const note of notes) console.log(`  note: ${note}`);

if (!LIVE) {
  // Said plainly, every run, because the gap is real and pretending otherwise
  // is the failure this check exists to prevent.
  console.log(
    "\n  NOT checked: production's actual ledger. Offline mode compares the files to a\n" +
      "  committed snapshot, so a migration applied through MCP and never committed is\n" +
      "  invisible here — the snapshot would not mention it either. Run\n" +
      "  `npm run migrations:verify:live` after applying anything to production."
  );
}
