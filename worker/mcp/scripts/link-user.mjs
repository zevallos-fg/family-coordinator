// Link one Supabase user to the MCP connector by storing a refresh token for them.
//
//   node scripts/link-user.mjs <email> [--local]
//
// What this does:
//   1. signs the user in (magic link, consumed here — no email is sent to them)
//   2. revokes that user's PREVIOUS connector token, if they had one
//   3. writes the new connector token to KV as token:<sha256>
//   4. writes the resulting REFRESH token to KV as refresh:<user-id>
//   5. prints the connector token once
//
// This script is the SINGLE WRITER of everything a linked user consists of.
// It used to write the refresh token itself and merely print the connector-token
// map entry for a human to set as a Worker secret — one half automatic, the other
// a manual step in a console scroll-back. They drifted: a second run minted a new
// token, the map was never updated, and a family member spent an evening holding
// a correctly formed credential the gate had never heard of.
//
// The Worker then exchanges that refresh token for access tokens on demand. It
// never holds a signing secret, so the worst a compromise yields is one user's
// session — revocable by signing that user out (which invalidates the refresh
// token immediately).
//
// This script uses the service-role key from .env.local. The Worker does not have
// it and has no code path that could use one; it is needed here only to mint the
// initial session without emailing the user.

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

const args = process.argv.slice(2);
const local = args.includes("--local");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("usage: node scripts/link-user.mjs <email> [--local]");
  process.exit(2);
}

function loadEnvLocal() {
  const out = {};
  const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (linkErr) {
  console.error(`generateLink failed: ${linkErr.message}`);
  process.exit(1);
}

const { data: sessionData, error: otpErr } = await anon.auth.verifyOtp({
  type: "magiclink",
  token_hash: link.properties.hashed_token,
});
if (otpErr) {
  console.error(`verifyOtp failed: ${otpErr.message}`);
  process.exit(1);
}

const session = sessionData.session;
const userId = session.user.id;

// Every KV operation this script performs, in one place. shell:true is needed
// for npx on Windows and is safe here: every argument is a fixed string, a UUID
// Supabase gave us, a SHA-256 digest, or a hex temp path. No secret is ever an
// argument — the two that are secret (the refresh token, the connector token)
// travel by --path.
const SCOPE = local ? "--local" : "--remote";

function kv(...args) {
  return execFileSync("npx", ["wrangler", "kv", "key", ...args, "--binding", "TOKENS", SCOPE], {
    cwd: resolve(HERE, ".."),
    stdio: ["ignore", "pipe", "inherit"],
    shell: true,
    encoding: "utf8",
  });
}

function kvPutFile(key, secret) {
  // A secret on a command line is visible to `ps` and lands in shell history, and
  // passing it through a shell makes its contents parseable as syntax.
  const tmp = resolve(tmpdir(), `fc-kv-${randomBytes(8).toString("hex")}`);
  writeFileSync(tmp, secret, { mode: 0o600 });
  try {
    kv("put", key, "--path", tmp);
  } finally {
    rmSync(tmp, { force: true });
  }
}

function kvGet(key) {
  try {
    return kv("get", key).trim() || null;
  } catch {
    // wrangler exits non-zero on a missing key rather than printing nothing.
    return null;
  }
}

const connectorToken = randomBytes(32).toString("base64url");
const tokenKey = `token:${createHash("sha256").update(connectorToken).digest("hex")}`;
const pointerKey = `tokenkey:${userId}`;

// REVOKE FIRST, then mint. Reminting used to revoke implicitly, because the
// connector token map was rewritten wholesale and the old entry simply ceased to
// exist. KV entries do not vanish when a new one is written, so without this the
// previous token would stay valid forever and "rotating" would mean handing out a
// second key to the same door.
//
// The reverse index exists for exactly this: finding the old token from the user
// id, without listing every key in the namespace and reading each one back.
// Ordering is deliberate — there is a brief window with NO valid token for this
// user, which is the right way round. The alternative leaves a window with two.
const previous = kvGet(pointerKey);
if (previous) {
  kv("delete", previous);
  console.log(`revoked previous connector token (${previous.slice(0, 14)}…)`);
}
// The cached access token is a live credential for this user. If this run is a
// response to a suspected leak, leaving it in place would keep that leak useful
// for up to an hour.
try {
  kv("delete", `access:${userId}`);
} catch {
  // Nothing cached. Not an error.
}

kvPutFile(`refresh:${userId}`, session.refresh_token);
kvPutFile(tokenKey, userId);
kvPutFile(pointerKey, tokenKey);

console.log(`

Linked ${email}
  user id        ${userId}
  refresh token  stored at refresh:${userId} (${local ? "local" : "remote"})
  connector      stored at ${tokenKey.slice(0, 20)}…

  ${connectorToken}

That is the connector token. It is shown ONCE and is stored nowhere in readable
form — KV holds only its SHA-256, because \`wrangler kv key list\` prints key names
in full and a raw-token key would put every live credential in the output of a
read-only listing.

Give it to ${email}. Nothing else needs setting: this script wrote both halves of
the link, so there is no secret to update and nothing to keep in step by hand.

To revoke: delete ${tokenKey.slice(0, 20)}… , or sign the user out in Supabase,
which kills the stored refresh token immediately.
`);
