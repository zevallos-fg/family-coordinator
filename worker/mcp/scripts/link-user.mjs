// Link one Supabase user to the MCP connector by storing a refresh token for them.
//
//   node scripts/link-user.mjs <email> [--local]
//
// What this does:
//   1. signs the user in (magic link, consumed here — no email is sent to them)
//   2. writes the resulting REFRESH token to KV as refresh:<user-id>
//   3. prints the connector-token map entry to set as a Worker secret
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
import { randomBytes } from "node:crypto";
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

// Store the refresh token, not the access token: access tokens expire in an hour
// and the Worker needs to keep working without anyone re-running this.
//
// The value goes via --path rather than as an argument. A refresh token on a
// command line would be visible to `ps` and would land in shell history, and
// passing it through a shell would make its contents parseable as syntax.
const tmp = resolve(tmpdir(), `fc-refresh-${randomBytes(8).toString("hex")}`);
writeFileSync(tmp, session.refresh_token, { mode: 0o600 });

const kvArgs = [
  "wrangler",
  "kv",
  "key",
  "put",
  "--binding",
  "TOKENS",
  `refresh:${userId}`,
  "--path",
  tmp,
  local ? "--local" : "--remote",
];

try {
  // shell:true is needed for npx on Windows, and is safe here: every argument is
  // either a fixed string, a UUID Supabase gave us, or a hex temp path. The one
  // value an attacker could influence — the refresh token — is in the file, not
  // on the command line.
  execFileSync("npx", kvArgs, { cwd: resolve(HERE, ".."), stdio: "inherit", shell: true });
} finally {
  rmSync(tmp, { force: true });
}

const connectorToken = randomBytes(32).toString("base64url");

console.log(`

Linked ${email}
  user id        ${userId}
  refresh token  stored at refresh:${userId} in KV (${local ? "local" : "remote"})

Set the connector token map so the Worker can recognise this person:

  npx wrangler secret put CONNECTOR_TOKEN_MAP
  {"${connectorToken}":"${userId}"}

Give ${email} the connector token above. It is shown once and is not stored here.
Signing this user out in the Supabase dashboard revokes the stored refresh token
and disables the connector immediately.
`);
