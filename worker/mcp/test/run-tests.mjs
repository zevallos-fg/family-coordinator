/**
 * Acceptance tests for the Family Co AI MCP server.
 *
 * Run against a locally-running worker:   npm run dev   (in another shell)
 * then:                                   node test/run-tests.mjs
 *
 * NOTE ON CREDENTIALS
 * The worker under test never sees a service-role key. This harness does use one,
 * from .env.local, for two things the worker is not allowed to do: reading rows
 * back to check what was written, and minting a genuine user session to prove
 * cross-project rejection. That is a property of the test, not of the server.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:8788/mcp";

const OTHER_PROJECTS = {
  "zevallos-fg's Project": "https://iwbquzaixvbemcuedibd.supabase.co",
  Tiqsi_Evals: "https://fiocdbvhbixpuusgbilj.supabase.co",
};

function loadEnv(file) {
  const p = path.join(REPO_ROOT, file);
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
  );
}

function loadDevVars() {
  const p = path.join(process.cwd(), ".dev.vars");
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
  );
}

const env = loadEnv(".env.local");
const devVars = loadDevVars();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CONNECTOR_TOKEN = devVars.TEST_CONNECTOR_TOKEN;
// Whether the connector is actually linked (a refresh token is stored in KV for
// the mapped user). Probed at startup rather than declared in config, so the
// suite cannot claim a write path works when nothing is wired up.
let LINKED = false;
let LINK_BLOCKER = "not probed yet";

let pass = 0;
let fail = 0;
let skip = 0;
const results = [];

function record(status, name, detail = "") {
  results.push({ status, name, detail });
  if (status === "PASS") pass++;
  else if (status === "FAIL") fail++;
  else skip++;
  const mark = status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : "SKIP";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(name, fn, { requiresLink = false } = {}) {
  if (requiresLink && !LINKED) {
    record("SKIP", name, `connector not linked: ${LINK_BLOCKER}`);
    return;
  }
  try {
    const detail = await fn();
    record("PASS", name, detail ?? "");
  } catch (err) {
    record("FAIL", name, err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function rpc(method, params, token = CONNECTOR_TOKEN) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

function toolPayload(body) {
  const text = body?.result?.content?.[0]?.text;
  assert(text, `no tool content in response: ${JSON.stringify(body)}`);
  return { payload: JSON.parse(text), isError: body.result.isError === true };
}

const admin =
  SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

async function main() {
  console.log(`MCP endpoint: ${MCP_URL}`);

  assert(admin, "harness needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");

  // Which user is the connector token supposed to be? Read from the map so the
  // test cannot disagree with the server about it.
  const tokenMap = JSON.parse(devVars.CONNECTOR_TOKEN_MAP ?? "{}");
  const mappedUserId = tokenMap[CONNECTOR_TOKEN];
  assert(mappedUserId, "TEST_CONNECTOR_TOKEN is not present in CONNECTOR_TOKEN_MAP in .dev.vars");

  // Probe once: can the server actually act as this user? That needs a refresh
  // token in KV for them. Anything else and the write tests skip with the real
  // reason rather than failing as if the code were broken.
  {
    const probe = await rpc("tools/call", { name: "whats_due", arguments: {} });
    if (probe.status !== 200) {
      LINK_BLOCKER = `server answered ${probe.status}`;
    } else {
      const text = probe.body?.result?.content?.[0]?.text ?? "";
      if (probe.body?.result?.isError) {
        LINK_BLOCKER = (JSON.parse(text).error ?? "tool error").slice(0, 120);
      } else {
        LINKED = true;
      }
    }
  }
  console.log(`Connector linked: ${LINKED}${LINKED ? "" : ` (${LINK_BLOCKER})`}
`);

  const { data: membership } = await admin
    .from("family_members")
    .select("family_id, families(name)")
    .eq("user_id", mappedUserId)
    .maybeSingle();
  assert(membership, `mapped user ${mappedUserId} is in no family`);
  const familyId = membership.family_id;
  const familyName = membership.families?.name;
  console.log(`Mapped user ${mappedUserId} -> family "${familyName}" (${familyId})\n`);

  // ---------------------------------------------------------------- handshake
  await check("handshake: initialize advertises tools capability", async () => {
    const { body } = await rpc("initialize", { protocolVersion: "2025-06-18" }, null);
    assert(body.result?.capabilities?.tools, "no tools capability");
    return `protocol ${body.result.protocolVersion}`;
  });

  await check("tools/list exposes exactly the eight agreed tools", async () => {
    const { body } = await rpc("tools/list", {});
    const names = (body.result?.tools ?? []).map((t) => t.name).sort();
    const expected = [
      "add_chore",
      "add_grocery",
      "define_term",
      "recall",
      "record_correction",
      "remember_decision",
      "remember_fact",
      "whats_due",
    ];
    assert(
      JSON.stringify(names) === JSON.stringify(expected),
      `got: ${names.join(", ")}`
    );
    return `${names.length} tools, no update/delete/sql/schema tools`;
  });

  // ------------------------------------------------- TEST 2: auth is enforced
  await check("TEST 2a: no Authorization header is rejected with 401", async () => {
    const { status, body, headers } = await rpc("tools/list", {}, null);
    assert(status === 401, `expected 401, got ${status}`);
    assert(body?.error, "401 carried no JSON-RPC error");
    assert(headers.get("www-authenticate"), "no WWW-Authenticate challenge");
    return body.error.message;
  });

  await check("TEST 2b: an unknown bearer token is rejected with 401", async () => {
    const { status, body } = await rpc("tools/list", {}, "not-a-real-token");
    assert(status === 401, `expected 401, got ${status}`);
    assert(/unauthorized/i.test(body?.error?.message ?? ""), "wrong error");
    return body.error.message;
  });

  await check("TEST 2c: a write with a bad token is rejected, not silently dropped", async () => {
    const before = await admin
      .from("memory_facts")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId);

    const { status } = await rpc(
      "tools/call",
      {
        name: "remember_fact",
        arguments: {
          subject_type: "household",
          subject_label: "MCP intruder probe",
          fact_key: "should_not_exist",
          fact_value: "should_not_exist",
          observed_at: new Date().toISOString(),
          certainty: "told",
        },
      },
      "not-a-real-token"
    );
    assert(status === 401, `expected 401, got ${status}`);

    const after = await admin
      .from("memory_facts")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId);
    assert(before.count === after.count, `row count changed ${before.count} -> ${after.count}`);
    return `401 and row count unchanged at ${after.count}`;
  });

  await check("TEST 2d: the request body cannot name the acting user", async () => {
    // Even handed an explicit user_id / family_id, the server must ignore both.
    const { body } = await rpc("tools/call", {
      name: "remember_fact",
      arguments: {
        subject_type: "household",
        subject_label: "MCP identity probe",
        fact_key: "spoof_attempt",
        fact_value: "spoofed",
        observed_at: new Date().toISOString(),
        certainty: "told",
        user_id: "a4b2af94-06f5-4a25-b84f-aecb89da9191",
        recorded_by_user_id: "a4b2af94-06f5-4a25-b84f-aecb89da9191",
        family_id: "00000000-0000-0000-0000-000000000000",
      },
    });
    const { payload, isError } = toolPayload(body);
    assert(!isError, `write failed: ${JSON.stringify(payload)}`);

    const { data: row } = await admin
      .from("memory_facts")
      .select("recorded_by_user_id, family_id")
      .eq("id", payload.id)
      .single();
    assert(
      row.recorded_by_user_id === mappedUserId,
      `recorded_by_user_id was ${row.recorded_by_user_id}, expected the mapped user`
    );
    assert(row.family_id === familyId, `family_id was ${row.family_id}, expected ${familyId}`);
    return "spoofed user_id and family_id both ignored";
  }, { requiresLink: true });

  // ------------------------------------------- TEST 1: a valid token can write
  await check("TEST 1: valid token writes a fact with correct attribution", async () => {
    const observedAt = "2026-02-14T09:30:00.000Z";
    const { body } = await rpc("tools/call", {
      name: "remember_fact",
      arguments: {
        subject_type: "kid",
        subject_label: "MCP Test Subject",
        fact_key: "mcp_acceptance",
        fact_value: "written by the mcp acceptance test",
        observed_at: observedAt,
        certainty: "told",
        note: "safe to delete",
      },
    });
    const { payload, isError } = toolPayload(body);
    assert(!isError, `tool reported an error: ${JSON.stringify(payload)}`);

    const { data: row } = await admin
      .from("memory_facts")
      .select("family_id, recorded_by_user_id, written_by, observed_at, certainty")
      .eq("id", payload.id)
      .single();

    assert(row.written_by === "claude_chat", `written_by was ${row.written_by}`);
    assert(row.recorded_by_user_id === mappedUserId, `recorded_by_user_id was ${row.recorded_by_user_id}`);
    assert(row.family_id === familyId, `family_id was ${row.family_id}`);
    assert(
      new Date(row.observed_at).toISOString() === observedAt,
      `observed_at was rewritten to ${row.observed_at}`
    );
    return `row ${payload.id}, observed_at preserved, written_by=claude_chat`;
  }, { requiresLink: true });

  await check("TEST 1b: a required timestamp cannot be omitted", async () => {
    const { body } = await rpc("tools/call", {
      name: "remember_fact",
      arguments: {
        subject_type: "household",
        subject_label: "MCP Test Subject",
        fact_key: "missing_observed_at",
        fact_value: "x",
        certainty: "told",
      },
    });
    const { payload, isError } = toolPayload(body);
    assert(isError, "server accepted a fact with no observed_at");
    assert(/not defaulted to now/i.test(payload.error), `unexpected error: ${payload.error}`);
    return "refused, and explains why";
  }, { requiresLink: true });

  // ------------------------------------------------- TEST 3: RLS actually binds
  await check("TEST 3: reads return the mapped family only, never Zevallos", async () => {
    const { data: zevallos } = await admin
      .from("families")
      .select("id")
      .eq("name", "Zevallos")
      .single();

    // Seed one recognisable row in each family, as the family's own data.
    const stamp = Date.now();
    await admin.from("memory_facts").insert([
      {
        family_id: familyId,
        subject_type: "household",
        subject_label: `MCP RLS fixture ${stamp}`,
        fact_key: "rls_probe",
        fact_value: "fixture-side row",
        observed_at: new Date().toISOString(),
        certainty: "told",
        written_by: "claude_code",
      },
      {
        family_id: zevallos.id,
        subject_type: "household",
        subject_label: `MCP RLS zevallos ${stamp}`,
        fact_key: "rls_probe",
        fact_value: "zevallos-side row",
        observed_at: new Date().toISOString(),
        certainty: "told",
        written_by: "claude_code",
      },
    ]);

    try {
      const { body } = await rpc("tools/call", {
        name: "recall",
        arguments: { query: "rls_probe" },
      });
      const { payload, isError } = toolPayload(body);
      assert(!isError, `recall failed: ${JSON.stringify(payload)}`);

      const blob = JSON.stringify(payload);
      assert(blob.includes(`MCP RLS fixture ${stamp}`), "did not see its own family's row");
      assert(
        !blob.includes(`MCP RLS zevallos ${stamp}`),
        "LEAK: recall returned a Zevallos row"
      );

      // whats_due must be family-scoped too.
      const due = await rpc("tools/call", { name: "whats_due", arguments: {} });
      const duePayload = toolPayload(due.body).payload;
      const foreign = (Array.isArray(duePayload) ? duePayload : []).filter(
        (r) => r.family_id && r.family_id !== familyId
      );
      assert(foreign.length === 0, `whats_due returned ${foreign.length} rows from another family`);

      return "own rows visible, Zevallos rows invisible in both recall and whats_due";
    } finally {
      await admin.from("memory_facts").delete().eq("fact_key", "rls_probe");
    }
  }, { requiresLink: true });

  // -------------------------------- TEST 4: cannot reach the other two projects
  await check("TEST 4a: worker config names only the Family Co AI project", async () => {
    const toml = fs.readFileSync(path.join(process.cwd(), "wrangler.toml"), "utf8");
    for (const [name, url] of Object.entries(OTHER_PROJECTS)) {
      const ref = new URL(url).hostname.split(".")[0];
      assert(!toml.includes(ref), `wrangler.toml mentions ${name}`);
    }
    assert(toml.includes("pmficrajnyeuworrqytn"), "wrangler.toml does not pin the target project");
    return "only pmficrajnyeuworrqytn appears in config";
  });

  await check("TEST 4b: no service-role or PAT credential anywhere in worker source", async () => {
    // Strip comments first: prose explaining what the worker deliberately does NOT
    // use is not a credential. This judges executable code.
    const code = fs
      .readdirSync(path.join(process.cwd(), "src"))
      .map((f) => fs.readFileSync(path.join(process.cwd(), "src", f), "utf8"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    // The anon key is intentionally allowed: it is public, role=anon, and the
    // gateway requires it. Everything below is a privileged credential.
    const banned = [/SERVICE_ROLE/i, /sbp_[A-Za-z0-9]/, /SUPABASE_ACCESS_TOKEN/, /BYPASSRLS/i];
    for (const re of banned) {
      const hit = re.exec(code);
      assert(!hit, `worker code references ${hit?.[0]}`);
    }
    // A hardcoded JWT would sidestep the whole mapping scheme.
    assert(!/eyJ[A-Za-z0-9_-]{20,}/.test(code), "worker code contains a hardcoded JWT");
    return "no service-role, PAT or hardcoded key in executable code";
  });

  await check("TEST 4c: a Family Co AI user token is rejected by the other two projects", async () => {
    // A genuine access token for the mapped user, minted through the real auth
    // flow. If project isolation holds, the other projects' PostgREST must reject
    // it: their JWT secrets differ, so the signature cannot verify.
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: (await admin.auth.admin.getUserById(mappedUserId)).data.user.email,
    });
    if (error) throw new Error(`could not mint a session: ${error.message}`);

    const verify = await admin.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    const accessToken = verify.data?.session?.access_token;
    assert(accessToken, "no access token from verifyOtp");

    // Sanity: the full credential pair works against the project it belongs to.
    const own = await fetch(`${SUPABASE_URL}/rest/v1/family_members?select=family_id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    assert(own.ok, `token rejected by its own project (${own.status})`);

    // Now offer that same pair — Family Co AI's anon key and a Family Co AI user
    // token — to the other two projects. Their signing keys differ, so both must
    // refuse. This is the credential the worker holds, tested where it must not work.
    const outcomes = [];
    for (const [name, url] of Object.entries(OTHER_PROJECTS)) {
      const res = await fetch(`${url}/rest/v1/family_members?select=*&limit=1`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
      });
      assert(
        res.status === 401 || res.status === 403,
        `${name} answered ${res.status} to Family Co AI credentials, expected 401/403`
      );
      outcomes.push(`${name}=${res.status}`);
    }
    return `own project ${own.status}; ${outcomes.join(", ")}`;
  });

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  if (skip) {
    console.log("\nSkipped tests need the connector linked to a user. Run:");
    console.log("  node scripts/link-user.mjs e2e+fixture@familyco.test --local");
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("harness error:", err.message);
  process.exit(1);
});
