// Refuse to deploy from anything other than a clean main that matches origin.
//
// `wrangler deploy` ships the working tree. It does not care which branch you are
// on, and it prints nothing that would tell you — so a checkout left on a feature
// branch from an hour ago ships that branch to production, silently and
// successfully.
//
// That is exactly what happened on 2026-09-08: a rotation script called
// `wrangler deploy` while the tree sat on feat/tokens-in-kv, which shipped a
// KV-backed auth gate whose KV entries did not exist yet. Both connectors 401'd,
// including the one belonging to the person running the script.
//
// Same shape as the build-id probe in tests/e2e/global-setup.ts, and for the same
// reason: a command acting on ambient state that nobody checked will eventually
// act on the wrong ambient state, and the failure will look like something else.
// A deploy is worse than a test run, because it is the live thing and the
// evidence of what went wrong is a version id nobody reads.
//
// Bypass, deliberately awkward and deliberately loud:
//
//   ALLOW_DEPLOY_FROM=<branch> npm run deploy
//
// Set it to the branch you actually intend, never to a wildcard — naming the
// branch is the point, because it means you knew which one you were on.

import { execFileSync } from "node:child_process";

const RED = "[31m";
const DIM = "[2m";
const OFF = "[0m";

function git(...args) {
  // stderr piped, not inherited: a probe that is EXPECTED to fail (rev-parse on a
  // branch with no upstream) should not print git's own fatal underneath a
  // message that already explains it.
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function refuse(headline, ...detail) {
  console.error(`\n${RED}REFUSING TO DEPLOY${OFF} — ${headline}\n`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

let branch, head, subject, dirty;
try {
  branch = git("rev-parse", "--abbrev-ref", "HEAD");
  head = git("rev-parse", "HEAD");
  subject = git("log", "-1", "--pretty=%s");
  dirty = git("status", "--porcelain");
} catch (err) {
  refuse("could not read git state, so nothing can be verified", String(err.message ?? err).trim());
}

const allowed = process.env.ALLOW_DEPLOY_FROM;

if (allowed && allowed !== branch) {
  refuse(
    `ALLOW_DEPLOY_FROM is "${allowed}" but you are on "${branch}"`,
    "The override names a branch so that naming it is a deliberate act.",
    "If you meant this branch, say so explicitly."
  );
}

if (!allowed && branch !== "main") {
  refuse(
    `on branch "${branch}", not main`,
    "wrangler deploy ships the working tree, not a branch you chose.",
    "",
    "  git checkout main && git pull",
    "",
    `To deploy this branch on purpose:  ALLOW_DEPLOY_FROM=${branch} npm run deploy`
  );
}

// Deliberately NOT inside the override. ALLOW_DEPLOY_FROM excuses which branch
// you are on; it does not excuse shipping something the repository has never
// seen. A deploy nobody can go back and read is the thing that makes an incident
// hard to unpick, whichever branch it came from.
let upstream;
try {
  upstream = git("rev-parse", `origin/${branch}`);
} catch {
  refuse(
    `origin/${branch} does not exist — this branch has never been pushed`,
    "Whatever ships would exist only on this machine.",
    "",
    `  git push -u origin ${branch}`
  );
}

if (head !== upstream) {
  refuse(
    `${branch} does not match origin/${branch}`,
    `  local   ${head.slice(0, 12)}  ${subject}`,
    `  origin  ${upstream.slice(0, 12)}`,
    "",
    "Deploying now ships something the repository does not agree with.",
    "Run `git fetch origin` first if this is stale rather than genuinely diverged."
  );
}

if (dirty) {
  const files = dirty.split("\n").slice(0, 8);
  refuse(
    "the working tree has uncommitted changes",
    "Those changes WOULD be deployed, and nothing in the repository would record it.",
    "",
    ...files.map((f) => `  ${f}`),
    dirty.split("\n").length > 8 ? `  … and ${dirty.split("\n").length - 8} more` : ""
  );
}

// Say what is about to ship. The failure this guard exists for was not loud —
// it succeeded, and looked exactly like the deploy that was intended.
console.log(
  `\ndeploying ${branch} ${head.slice(0, 12)}${allowed ? " (override)" : ""}\n` +
    `${DIM}  ${subject}${OFF}\n`
);
