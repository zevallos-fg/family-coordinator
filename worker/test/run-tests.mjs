// Acceptance tests for the Anthropic proxy hardening.
//
// Run against a local dev server:
//   cd worker && npx wrangler dev --env dev --port 8788     (terminal 1)
//   node test/run-tests.mjs                                  (terminal 2)
//
// No test here makes a real Anthropic call. The "valid token" cases deliberately
// ask for a rejected model or an over-cap max_tokens, so they prove the request
// got past authentication and stopped at validation — without spending anything.
//
// The harness uses the service-role key from .env.local to mint a session for the
// E2E fixture user. The WORKER does not have that key and cannot get one; only
// this script does, and only to produce a normal user token to present to it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BASE = process.env.PROXY_URL ?? "http://127.0.0.1:8788";
const FIXTURE_EMAIL = "e2e+fixture@familyco.test";

const GOOD_ORIGIN = "https://family-coordinator.vercel.app";
const PREVIEW_ORIGIN =
  "https://family-coordinator-htks5s6ya-zevallos-fgs-projects.vercel.app";
const EVIL_ORIGIN = "https://family-coordinator-evil.vercel.app";

function loadEnvLocal() {
  const out = {};
  let raw;
  try {
    raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(name, detail = "") {
  passed++;
  console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  failed++;
  console.log(`[FAIL] ${name} — ${detail}`);
}
function skip(name, why) {
  skipped++;
  console.log(`[SKIP] ${name} — ${why}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (err) {
    fail(name, err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function post(path, { token, body, origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { res, body: parsed };
}

// ---------------------------------------------------------------------------
// A real user token, obtained the way the app obtains one.
// ---------------------------------------------------------------------------
async function fixtureAccessToken() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return null;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: FIXTURE_EMAIL,
  });
  if (error) throw new Error(`generateLink failed: ${error.message}`);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: otpErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (otpErr) throw new Error(`verifyOtp failed: ${otpErr.message}`);
  return session.session.access_token;
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function main() {
  console.log(`\nProxy hardening acceptance — ${BASE}\n`);

  try {
    const ping = await fetch(`${BASE}/health`);
    if (!ping.ok) throw new Error(`status ${ping.status}`);
  } catch (err) {
    console.error(
      `Cannot reach ${BASE} (${err.message}).\n` +
        `Start it first:  cd worker && npx wrangler dev --env dev --port 8788\n`
    );
    process.exit(2);
  }

  // ---- Unauthenticated surface --------------------------------------------
  await check("/health answers without a token and reveals nothing", async () => {
    const res = await fetch(`${BASE}/health`);
    const body = await res.json();
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(
      Object.keys(body).length === 1 && body.ok === true,
      `health leaked extra fields: ${JSON.stringify(body)}`
    );
    return "200 {ok:true}";
  });

  await check("GET on a spending route is refused", async () => {
    const res = await fetch(`${BASE}/parse-grocery`);
    assert(res.status === 405, `expected 405, got ${res.status}`);
    return "405";
  });

  // ---- AUTH: every route rejects an unauthenticated caller -----------------
  const ROUTES = [
    "/",
    "/parse-grocery",
    "/extract-recipe-url",
    "/extract-recipe-image",
    "/extract-barcode-wrapper",
    "/parse-receipt-photo",
    "/parse-receipt-email",
    "/fetch-html",
  ];

  await check("AUTH: all eight routes reject a request with no token", async () => {
    const bad = [];
    for (const path of ROUTES) {
      const { res } = await post(path, { body: { text: "milk" } });
      if (res.status !== 401) bad.push(`${path}=>${res.status}`);
    }
    assert(bad.length === 0, `these did not return 401: ${bad.join(", ")}`);
    return `8/8 → 401`;
  });

  await check("AUTH: 401 carries a WWW-Authenticate challenge", async () => {
    const { res } = await post("/parse-grocery", { body: { text: "milk" } });
    const h = res.headers.get("WWW-Authenticate");
    assert(h && /Bearer/i.test(h), `missing challenge header, got ${h}`);
    return h;
  });

  await check("AUTH: a garbage bearer token is rejected", async () => {
    const { res } = await post("/parse-grocery", {
      token: "not-a-jwt",
      body: { text: "milk" },
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
    return "401";
  });

  await check("AUTH: alg=none is rejected (algorithm confusion)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
      sub: "00000000-0000-4000-8000-000000000000",
      role: "authenticated",
      aud: "authenticated",
      iss: `${SUPABASE_URL}/auth/v1`,
      exp: now + 3600,
    })}.`;
    const { res, body } = await post("/parse-grocery", {
      token: forged,
      body: { text: "milk" },
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
    assert(/algorithm/i.test(body?.error ?? ""), `unexpected reason: ${body?.error}`);
    return body.error;
  });

  await check("AUTH: an HS256 token is rejected even with valid-looking claims", async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: "00000000-0000-4000-8000-000000000000",
      role: "service_role",
      aud: "authenticated",
      iss: `${SUPABASE_URL}/auth/v1`,
      exp: now + 3600,
    })}.AAAA`;
    const { res } = await post("/parse-grocery", { token: forged, body: { text: "milk" } });
    assert(res.status === 401, `expected 401, got ${res.status}`);
    return "401 — HS256 never reaches a verify call";
  });

  if (ANON_KEY) {
    await check("AUTH: the public anon key is not a usable credential here", async () => {
      const { res } = await post("/parse-grocery", {
        token: ANON_KEY,
        body: { text: "milk" },
      });
      assert(res.status === 401, `expected 401, got ${res.status}`);
      return "401 — anon key rejected";
    });
  } else {
    skip("AUTH: anon key rejected", "no anon key in .env.local");
  }

  // ---- CORS ----------------------------------------------------------------
  await check("CORS: an unknown origin gets no Allow-Origin header", async () => {
    const { res } = await post("/parse-grocery", {
      origin: EVIL_ORIGIN,
      body: { text: "milk" },
    });
    const acao = res.headers.get("Access-Control-Allow-Origin");
    assert(acao === null, `expected no header, got "${acao}"`);
    return `${EVIL_ORIGIN} not reflected`;
  });

  await check("CORS: the production origin is allowed", async () => {
    const res = await fetch(`${BASE}/parse-grocery`, {
      method: "OPTIONS",
      headers: { Origin: GOOD_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    assert(res.status === 204, `expected 204, got ${res.status}`);
    assert(
      res.headers.get("Access-Control-Allow-Origin") === GOOD_ORIGIN,
      `got "${res.headers.get("Access-Control-Allow-Origin")}"`
    );
    assert(/Origin/i.test(res.headers.get("Vary") ?? ""), "missing Vary: Origin");
    return "204 + echoed + Vary";
  });

  await check("CORS: a Vercel preview origin is allowed", async () => {
    const res = await fetch(`${BASE}/parse-grocery`, {
      method: "OPTIONS",
      headers: { Origin: PREVIEW_ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    assert(
      res.headers.get("Access-Control-Allow-Origin") === PREVIEW_ORIGIN,
      `preview origin not allowed: ${res.headers.get("Access-Control-Allow-Origin")}`
    );
    return "preview echoed";
  });

  // ---- Authenticated: model and token ceilings -----------------------------
  let token = null;
  try {
    token = await fixtureAccessToken();
  } catch (err) {
    console.log(`  (could not mint a fixture session: ${err.message})`);
  }

  if (!token) {
    const why = !SERVICE_KEY
      ? "SUPABASE_SERVICE_ROLE_KEY missing from .env.local"
      : "could not mint a fixture session";
    skip("AUTH: a real user token is accepted", why);
    skip("LIMITS: a disallowed model is refused", why);
    skip("LIMITS: max_tokens above the cap is refused", why);
    skip("LIMITS: the passthrough requires a messages array", why);
  } else {
    await check("AUTH: a real user token gets past the gate", async () => {
      // Asks for a model the allowlist rejects: a 400 proves authentication
      // succeeded and validation ran, with no Anthropic call made.
      const { res, body } = await post("/", {
        token,
        body: {
          model: "claude-opus-4-1-20250805",
          max_tokens: 100,
          messages: [{ role: "user", content: "hi" }],
        },
      });
      assert(res.status !== 401, "a valid user token was rejected");
      assert(res.status === 400, `expected 400 from validation, got ${res.status}`);
      assert(/model not allowed/.test(body?.error ?? ""), `unexpected: ${body?.error}`);
      return "401 avoided, stopped at model validation";
    });

    await check("LIMITS: a disallowed model is refused on a named route too", async () => {
      const { res, body } = await post("/extract-recipe-url", {
        token,
        body: { html: "<h1>x</h1>", model: "claude-opus-4-1-20250805" },
      });
      assert(res.status === 400, `expected 400, got ${res.status}`);
      assert(/model not allowed/.test(body?.error ?? ""), `unexpected: ${body?.error}`);
      return body.error;
    });

    await check("LIMITS: max_tokens above the cap is refused", async () => {
      const { res, body } = await post("/", {
        token,
        body: {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200000,
          messages: [{ role: "user", content: "hi" }],
        },
      });
      assert(res.status === 400, `expected 400, got ${res.status}`);
      assert(/max_tokens/.test(body?.error ?? ""), `unexpected: ${body?.error}`);
      return body.error;
    });

    await check("LIMITS: the passthrough requires a messages array", async () => {
      const { res } = await post("/", {
        token,
        body: { model: "claude-haiku-4-5-20251001", max_tokens: 10 },
      });
      assert(res.status === 400, `expected 400, got ${res.status}`);
      return "400";
    });
  }

  // ---- /fetch-html target pinning ------------------------------------------
  if (!token) {
    skip("FETCH: only allowlisted https origins are reachable", "no fixture session");
  } else {
    await check("FETCH: only allowlisted https origins are reachable", async () => {
      const cases = [
        // [url, expected status, what it proves]
        ["https://evil.example.com/x", 403, "off-allowlist host"],
        // Suffix matching must not treat the allowlisted name as a prefix of
        // someone else's domain.
        ["https://allrecipes.com.evil.example/x", 403, "allowlist name as a subdomain of an attacker domain"],
        ["http://allrecipes.com/x", 403, "plain http"],
        ["not-a-url", 400, "unparseable"],
      ];
      const bad = [];
      for (const [url, want, why] of cases) {
        const { res } = await post("/fetch-html", { token, body: { url } });
        if (res.status !== want) bad.push(`${why}: wanted ${want}, got ${res.status}`);
      }
      assert(bad.length === 0, bad.join("; "));
      return `${cases.length}/${cases.length} refused before any fetch`;
    });
  }

  // ---- Rate limiting -------------------------------------------------------
  // Last, because it deliberately burns the caller's per-minute window.
  if (!token) {
    skip("RATE LIMIT: a user is cut off after the per-minute ceiling", "no fixture session");
  } else {
    await check("RATE LIMIT: a user is cut off after the per-minute ceiling", async () => {
      // Every request here is rejected at model validation, so nothing is spent —
      // but the limiter is charged before validation runs, which is the point.
      const body = {
        model: "claude-opus-4-1-20250805",
        max_tokens: 100,
        messages: [{ role: "user", content: "hi" }],
      };
      let limitedAt = null;
      for (let i = 1; i <= 30; i++) {
        const { res } = await post("/", { token, body });
        if (res.status === 429) {
          limitedAt = i;
          const retry = res.headers.get("Retry-After");
          assert(retry && Number(retry) > 0, `429 without a usable Retry-After: ${retry}`);
          break;
        }
        assert(res.status === 400, `unexpected status at request ${i}: ${res.status}`);
      }
      assert(limitedAt !== null, "30 requests went through with no limit applied");
      return `429 at request ${limitedAt} (ceiling is 20/min)`;
    });
  }

  // ---- Source scan ---------------------------------------------------------
  await check("SOURCE: no Supabase key is present in worker source", async () => {
    const src = ["src/index.js", "src/auth.js", "src/ratelimit.js"]
      .map((f) => readFileSync(resolve(HERE, "..", f), "utf8"))
      .join("\n")
      // Strip comments so the words in explanatory prose are not matched.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const banned = [/service_role/i, /SERVICE_ROLE_KEY/, /sbp_/, /eyJ[A-Za-z0-9_-]{20,}/];
    const hits = banned.filter((re) => re.test(src)).map(String);
    assert(hits.length === 0, `matched: ${hits.join(", ")}`);
    return "clean";
  });

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
