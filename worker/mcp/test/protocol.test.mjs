// Protocol conformance for the MCP endpoint.
//
//   node test/protocol.test.mjs [baseUrl]
//   MCP_BASE_URL=https://... node test/protocol.test.mjs
//
// Defaults to the local dev server on 8788 (`npm run dev`), which needs no
// Cloudflare credentials: every assertion here is rejected or answered before
// the auth gate, so none of it needs a connector token or touches a database.
//
// The first test is the one that matters. The server used to answer a request
// declaring protocol version 1900-01-01 with HTTP 200 and resultType
// "complete" — claiming to have completed a request in a version that has never
// existed, while the same body advertised a supportedVersions list contradicting
// it. A client handed a success has no defined error to act on, and three
// separate client-side failures followed from it.

const BASE = (process.argv[2] ?? process.env.MCP_BASE_URL ?? "http://127.0.0.1:8788").replace(/\/$/, "");

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name} — ${detail}`);
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

async function post(body, headers = {}) {
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, body: json };
}

const MODERN = "2026-07-28";
const META = (version = MODERN, extra = {}) => ({
  "io.modelcontextprotocol/protocolVersion": version,
  "io.modelcontextprotocol/clientCapabilities": {},
  ...extra,
});

console.log(`=== MCP protocol conformance against ${BASE} ===\n`);

// ── The regression this suite exists for ────────────────────────────────────
console.log("[version gate] a version we do not implement must be refused, not completed");
{
  const { status, body } = await post(
    { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META("1900-01-01") } },
    { "MCP-Protocol-Version": "1900-01-01", "Mcp-Method": "server/discover" }
  );

  check("1900-01-01: HTTP 400", status === 400, `got ${status}`);
  check(
    "1900-01-01: error code -32022",
    body?.error?.code === -32022,
    `got ${JSON.stringify(body?.error ?? body).slice(0, 200)}`
  );
  check(
    "1900-01-01: data.requested echoes what was asked for",
    body?.error?.data?.requested === "1900-01-01",
    `got ${JSON.stringify(body?.error?.data)}`
  );
  check(
    "1900-01-01: data.supported lists the versions we do implement",
    Array.isArray(body?.error?.data?.supported) &&
      body.error.data.supported.includes(MODERN) &&
      body.error.data.supported.includes("2025-06-18"),
    `got ${JSON.stringify(body?.error?.data?.supported)}`
  );

  // Stated as its own assertion rather than implied by the ones above, because
  // this exact shape is what shipped and what must never ship again.
  check(
    "1900-01-01: does NOT return a result",
    body?.result === undefined,
    `returned a result: ${String(JSON.stringify(body?.result)).slice(0, 200)}`
  );
  check(
    ' 1900-01-01: does NOT return 200 with resultType "complete"',
    !(status === 200 && body?.result?.resultType === "complete"),
    `got ${status} with resultType=${body?.result?.resultType}`
  );
}

// ── Header/body agreement ───────────────────────────────────────────────────
console.log("\n[header validation] headers mirror the body and must agree with it");
{
  const mismatch = await post(
    { jsonrpc: "2.0", id: 2, method: "server/discover", params: { _meta: META(MODERN) } },
    { "MCP-Protocol-Version": "2025-06-18", "Mcp-Method": "server/discover" }
  );
  check("version header vs body mismatch: 400 + -32020", mismatch.status === 400 && mismatch.body?.error?.code === -32020,
    `got ${mismatch.status} ${JSON.stringify(mismatch.body?.error)}`);

  const noMethodHeader = await post(
    { jsonrpc: "2.0", id: 3, method: "server/discover", params: { _meta: META() } },
    { "MCP-Protocol-Version": MODERN }
  );
  check("modern request without Mcp-Method: 400 + -32020", noMethodHeader.status === 400 && noMethodHeader.body?.error?.code === -32020,
    `got ${noMethodHeader.status} ${JSON.stringify(noMethodHeader.body?.error)}`);

  const wrongMethodHeader = await post(
    { jsonrpc: "2.0", id: 4, method: "server/discover", params: { _meta: META() } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/list" }
  );
  check("Mcp-Method disagreeing with the body: 400 + -32020", wrongMethodHeader.status === 400 && wrongMethodHeader.body?.error?.code === -32020,
    `got ${wrongMethodHeader.status} ${JSON.stringify(wrongMethodHeader.body?.error)}`);

  const noName = await post(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "whats_due", arguments: {}, _meta: META() } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call" }
  );
  check("tools/call without Mcp-Name: 400 + -32020", noName.status === 400 && noName.body?.error?.code === -32020,
    `got ${noName.status} ${JSON.stringify(noName.body?.error)}`);

  const wrongName = await post(
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "whats_due", arguments: {}, _meta: META() } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call", "Mcp-Name": "remember_fact" }
  );
  check("Mcp-Name disagreeing with params.name: 400 + -32020", wrongName.status === 400 && wrongName.body?.error?.code === -32020,
    `got ${wrongName.status} ${JSON.stringify(wrongName.body?.error)}`);

  // Base64 sentinel form must be decoded before comparing.
  const encoded = "=?base64?" + Buffer.from("whats_due", "utf8").toString("base64") + "?=";
  const encodedName = await post(
    { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "whats_due", arguments: {}, _meta: META() } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "tools/call", "Mcp-Name": encoded }
  );
  check("Base64-wrapped Mcp-Name is decoded, not compared raw",
    encodedName.body?.error?.code !== -32020,
    `got ${encodedName.status} ${JSON.stringify(encodedName.body?.error)}`);
}

// ── Required per-request metadata ───────────────────────────────────────────
console.log("\n[_meta] modern requests carry version and capabilities per request");
{
  const noCaps = await post(
    { jsonrpc: "2.0", id: 8, method: "server/discover", params: { _meta: { "io.modelcontextprotocol/protocolVersion": MODERN } } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "server/discover" }
  );
  check("missing clientCapabilities: 400 + -32602", noCaps.status === 400 && noCaps.body?.error?.code === -32602,
    `got ${noCaps.status} ${JSON.stringify(noCaps.body?.error)}`);
}

// ── The happy path, both eras ───────────────────────────────────────────────
console.log("\n[dual-era] modern discovery and the legacy handshake both work");
{
  const discover = await post(
    { jsonrpc: "2.0", id: 9, method: "server/discover", params: { _meta: META() } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "server/discover" }
  );
  check("server/discover: HTTP 200", discover.status === 200, `got ${discover.status}`);
  check('server/discover: resultType "complete"', discover.body?.result?.resultType === "complete",
    `got ${discover.body?.result?.resultType}`);
  check("server/discover: advertises the modern version",
    discover.body?.result?.supportedVersions?.includes(MODERN),
    `got ${JSON.stringify(discover.body?.result?.supportedVersions)}`);
  check("server/discover: reports serverInfo in _meta",
    discover.body?.result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name === "familyco-mcp",
    `got ${JSON.stringify(discover.body?.result?._meta)}`);
  check("server/discover: declares the tools capability",
    discover.body?.result?.capabilities?.tools !== undefined,
    `got ${JSON.stringify(discover.body?.result?.capabilities)}`);

  // initialize is deliberately NOT removed: legacy clients and the acceptance
  // suite both depend on it, and a dual-era server serves both.
  const init = await post({
    jsonrpc: "2.0", id: 10, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  check("initialize: still answered", init.status === 200, `got ${init.status}`);
  check("initialize: echoes a legacy protocol version",
    init.body?.result?.protocolVersion === "2025-06-18",
    `got ${init.body?.result?.protocolVersion}`);

  // A request declaring nothing at all is assumed legacy rather than refused.
  const bare = await post({ jsonrpc: "2.0", id: 11, method: "tools/list" });
  check("no version declared: not a version error (assumed legacy)",
    bare.body?.error?.code !== -32022,
    `got ${bare.status} ${JSON.stringify(bare.body?.error)}`);
  check("no version declared: still gated by auth (401)",
    bare.status === 401,
    `got ${bare.status} ${JSON.stringify(bare.body?.error)}`);
}

// ── Transport-level shapes ──────────────────────────────────────────────────
console.log("\n[transport] method and verb handling");
{
  const unknown = await post(
    { jsonrpc: "2.0", id: 12, method: "definitely/not/a/method", params: { _meta: META() } },
    { "MCP-Protocol-Version": MODERN, "Mcp-Method": "definitely/not/a/method" }
  );
  check("unknown method: 404 + -32601", unknown.status === 404 && unknown.body?.error?.code === -32601,
    `got ${unknown.status} ${JSON.stringify(unknown.body?.error)}`);

  const get = await fetch(`${BASE}/`, { method: "GET", headers: { Accept: "text/event-stream" } });
  check("GET on the MCP endpoint: 405, not 404", get.status === 405, `got ${get.status}`);
  check("GET on the MCP endpoint: Allow: POST", (get.headers.get("Allow") ?? "").includes("POST"),
    `got ${get.headers.get("Allow")}`);

  const ping = await post({ jsonrpc: "2.0", id: 13, method: "ping" });
  check('ping: carries resultType "complete"', ping.body?.result?.resultType === "complete",
    `got ${JSON.stringify(ping.body?.result)}`);
}

// ── Authorization framing ───────────────────────────────────────────────────
//
// The regression that cost an evening. Claude.ai's connector sends
// `Authorization: <token>` with no scheme; the worker required `Bearer ` and
// refused it. Discovery and initialize are unauthenticated so they succeeded —
// the connector said "connected" — and tools/list, the first authenticated call,
// 401'd every time. An empty tool list forever, and eventually a client that
// decided the connection had expired against a server that holds no sessions.
//
// TOKEN maps to a throwaway UUID and reaches no database: tools/list returns the
// static tool definitions immediately after the auth gate and never calls
// Supabase. CI writes a .dev.vars containing it; to run these locally, add the
// same entry to your own CONNECTOR_TOKEN_MAP or set MCP_TEST_TOKEN.
console.log("\n[authorization] a bare token and a Bearer token must behave identically");
{
  const TOKEN = process.env.MCP_TEST_TOKEN ?? "mcp-ci-test-token";
  const BAD = "definitely-not-a-real-connector-token";

  async function toolsList(authHeader) {
    return post({ jsonrpc: "2.0", id: 20, method: "tools/list" }, authHeader ? { Authorization: authHeader } : {});
  }

  const bearerValid = await toolsList(`Bearer ${TOKEN}`);
  check("Bearer <valid>: HTTP 200", bearerValid.status === 200, `got ${bearerValid.status} ${JSON.stringify(bearerValid.body?.error)}`);
  check("Bearer <valid>: 8 tools", (bearerValid.body?.result?.tools ?? []).length === 8,
    `got ${(bearerValid.body?.result?.tools ?? []).length}`);

  const bareValid = await toolsList(TOKEN);
  check("bare <valid>: HTTP 200  [the regression]", bareValid.status === 200,
    `got ${bareValid.status} ${JSON.stringify(bareValid.body?.error)}`);
  check("bare <valid>: 8 tools  [the regression]", (bareValid.body?.result?.tools ?? []).length === 8,
    `got ${(bareValid.body?.result?.tools ?? []).length}`);

  // Framing must not change the outcome — that is the whole property.
  check("bare and Bearer agree on the tool list",
    JSON.stringify(bareValid.body?.result?.tools) === JSON.stringify(bearerValid.body?.result?.tools),
    "the two framings returned different tool lists");

  const bearerBad = await toolsList(`Bearer ${BAD}`);
  check("Bearer <bad>: 401", bearerBad.status === 401, `got ${bearerBad.status}`);
  check("Bearer <bad>: refused as unrecognised, not as malformed",
    /unrecognised connector token/i.test(bearerBad.body?.error?.message ?? ""),
    `got ${bearerBad.body?.error?.message}`);

  const bareBad = await toolsList(BAD);
  check("bare <bad>: 401", bareBad.status === 401, `got ${bareBad.status}`);
  // The specific thing that used to be wrong: a bare token was rejected for its
  // FRAMING before its value was ever looked at.
  check("bare <bad>: refused as unrecognised, not for lacking a scheme",
    /unrecognised connector token/i.test(bareBad.body?.error?.message ?? ""),
    `got ${bareBad.body?.error?.message}`);

  const absent = await toolsList(null);
  check("no Authorization header: 401", absent.status === 401, `got ${absent.status}`);
  check("no Authorization header: says the header is missing",
    /missing Authorization header/i.test(absent.body?.error?.message ?? ""),
    `got ${absent.body?.error?.message}`);
}

console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);
if (failures.length) {
  for (const f of failures) console.log("  FAILED:", f);
  process.exit(1);
}
