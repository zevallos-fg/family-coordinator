// One-time: give an ALREADY-ISSUED connector token its KV entries.
//
//   node scripts/backfill-token.mjs <supabase-user-uuid> [--local]
//
// Exists for one migration and should be deleted after it: moving token
// resolution from the CONNECTOR_TOKEN_MAP secret into KV. The tokens people are
// already holding were minted under the old scheme and have no KV entry, so
// deploying the new worker without this would lock everyone out and force another
// round of reconnecting — which is the specific cost this whole change exists to
// stop paying.
//
// It writes exactly what link-user.mjs writes for the token half, and nothing
// else. It does NOT touch refresh:<uid>: those entries are already correct, were
// written by link-user.mjs itself, and re-minting them would invalidate the
// sessions that currently work.
//
// The token is read from a hidden prompt, never an argument: a credential on a
// command line is visible to `ps` and lands in shell history.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const local = args.includes("--local");
const userId = args.find((a) => !a.startsWith("--"));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!userId || !UUID_RE.test(userId)) {
  console.error("usage: node scripts/backfill-token.mjs <supabase-user-uuid> [--local]");
  console.error("the argument must be a Supabase auth user id, not an email and not a token");
  process.exit(2);
}

/** Read one line without echoing it. */
function promptHidden(question) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      // Repaint the prompt with nothing after it, so the value never appears.
      if (![`\r`, `\n`, ``].includes(char.toString())) {
        process.stdout.write(`[2K[200D${question}`);
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      res(answer.trim());
    });
  });
}

const token = await promptHidden("connector token (already issued, will not be echoed): ");

// Refuse a value that cannot be a token this project minted, before it becomes a
// live credential in KV. link-user.mjs mints 32 random bytes as base64url, which
// is always 43 characters.
if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
  console.error(
    `\nRefused: expected 43 base64url characters, got ${token.length}. Nothing was written.`
  );
  process.exit(1);
}

const SCOPE = local ? "--local" : "--remote";
function kv(...a) {
  return execFileSync("npx", ["wrangler", "kv", "key", ...a, "--binding", "TOKENS", SCOPE], {
    cwd: resolve(HERE, ".."),
    stdio: ["ignore", "pipe", "inherit"],
    shell: true,
    encoding: "utf8",
  });
}
function kvPutFile(key, value) {
  const tmp = resolve(tmpdir(), `fc-kv-${randomBytes(8).toString("hex")}`);
  writeFileSync(tmp, value, { mode: 0o600 });
  try {
    kv("put", key, "--path", tmp);
  } finally {
    rmSync(tmp, { force: true });
  }
}

const tokenKey = `token:${createHash("sha256").update(token).digest("hex")}`;
const pointerKey = `tokenkey:${userId}`;

// Any previous entry for this user is stale by definition — the token being
// backfilled is the one they hold now.
let previous = null;
try {
  previous = kv("get", pointerKey).trim() || null;
} catch {
  previous = null;
}
if (previous && previous !== tokenKey) {
  kv("delete", previous);
  console.log(`revoked a previous token entry (${previous.slice(0, 14)}…)`);
}

kvPutFile(tokenKey, userId);
kvPutFile(pointerKey, tokenKey);

console.log(`
Backfilled ${userId}
  ${tokenKey}

The token itself was not printed and is not stored — KV holds only its SHA-256.
Verify by calling the worker with it once the new build is deployed; a 200 with
nine tools means the entry is right.
`);
