// remember_task, against the deployed worker and the real database.
//
//   MCP_TOKEN=<connector token> node test/tasks.acceptance.mjs [baseUrl]
//
// Unlike protocol.test.mjs this needs credentials and writes rows, so it is not
// in CI: it wants a live connector token and reads back with the service-role
// key from .env.local. Every row it writes is deleted before it exits, and the
// counts are verified back to their starting values rather than assumed.
//
// It writes into the family the token belongs to. Point it at the FIXTURE
// connector token, never a real household's, unless you intend the rows.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] ?? process.env.MCP_BASE_URL ?? "https://familyco-mcp.zevallos-fg.workers.dev").replace(/\/$/, "");
const TOKEN = process.env.MCP_TOKEN;
if (!TOKEN) {
  console.error("MCP_TOKEN is required — a connector token for the family to write into.");
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = {};
for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

let passed = 0;
const failures = [];
const written = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name} — ${detail}`);
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

async function callTool(name, args) {
  const res = await fetch(`${BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.json().catch(() => null);
  const text = body?.result?.content?.[0]?.text;
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: res.status, isError: body?.result?.isError === true, payload, raw: body };
}

async function service(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

console.log(`=== remember_task acceptance against ${BASE} ===\n`);

// Which family does this token write into? Ask the server, don't assume.
const due = await callTool("whats_due", {});
check("whats_due answers (token is live)", !due.isError, JSON.stringify(due.payload).slice(0, 200));
const FAMILY = Array.isArray(due.payload) && due.payload[0]?.family_id ? due.payload[0].family_id : null;

const beforeTasks = (await service(`tasks?select=id`)) ?? [];
const DUE_AT = new Date(Date.now() + 2 * 86400000).toISOString();
const TITLE = `acceptance task ${Date.now()}`;

// ── 1. Writes, with correct attribution ─────────────────────────────────────
console.log("\n[write] attribution is recorded, not defaulted");
{
  const r = await callTool("remember_task", {
    title: TITLE,
    description: "written by the acceptance suite; safe to delete",
    due_at: DUE_AT,
  });
  check("remember_task succeeds", !r.isError && !!r.payload?.id, JSON.stringify(r.payload).slice(0, 300));

  if (r.payload?.id) {
    written.push(r.payload.id);
    const rows = await service(`tasks?select=id,family_id,title,due_at,status,written_by,created_by_user_id,owner_user_id&id=eq.${r.payload.id}`);
    const row = rows?.[0];
    check("row exists", !!row, "no row read back");
    if (row) {
      check("written_by = 'claude_chat'", row.written_by === "claude_chat", `got ${row.written_by}`);
      check("created_by_user_id is set from the connector token", !!row.created_by_user_id, `got ${row.created_by_user_id}`);
      check("status = 'open'", row.status === "open", `got ${row.status}`);
      check("due_at preserved, not defaulted to now()",
        Math.abs(new Date(row.due_at) - new Date(DUE_AT)) < 1000,
        `sent ${DUE_AT}, stored ${row.due_at}`);
      check("owner_user_id null when no owner given", row.owner_user_id === null, `got ${row.owner_user_id}`);

      // 2. Appears in v_whats_due, in the right bucket.
      const inDue = await service(`v_whats_due?select=kind,bucket,item,source_id&source_id=eq.${r.payload.id}`);
      check("appears in v_whats_due", (inDue ?? []).length === 1, `got ${(inDue ?? []).length} rows`);
      check("v_whats_due kind = 'task'", inDue?.[0]?.kind === "task", `got ${inDue?.[0]?.kind}`);
      check("v_whats_due bucket = 'this_week' for a task due in 2 days",
        inDue?.[0]?.bucket === "this_week", `got ${inDue?.[0]?.bucket}`);
    }
  }
}

// ── 3. An unknown owner errors rather than silently nulling ─────────────────
console.log("\n[owner] an unknown name is refused, not dropped");
{
  const before = ((await service(`tasks?select=id`)) ?? []).length;
  const r = await callTool("remember_task", {
    title: `${TITLE} (unknown owner)`,
    due_at: DUE_AT,
    owner: "Nobody Whatsoever",
  });
  check("unknown owner returns an error", r.isError === true, `isError=${r.isError} payload=${JSON.stringify(r.payload)}`);
  check("the error names the person and lists who is known",
    /no family member named/i.test(String(r.payload?.error ?? "")),
    `got ${JSON.stringify(r.payload)}`);

  // The failure mode being guarded: accepting the write with owner_user_id null.
  const after = ((await service(`tasks?select=id`)) ?? []).length;
  check("no task was written with a null owner instead", after === before, `tasks went ${before} -> ${after}`);
  const leaked = await service(`tasks?select=id&title=eq.${encodeURIComponent(`${TITLE} (unknown owner)`)}`);
  for (const row of leaked ?? []) written.push(row.id);
  check("no row exists with that title", (leaked ?? []).length === 0, `found ${(leaked ?? []).length}`);
}

// ── 4. A task aimed at another family is refused ────────────────────────────
console.log("\n[rls] the caller cannot write into another family");
{
  // family_id is never accepted from a tool call — the worker resolves it from
  // the token. Passing one is the attack, and it must be ignored, not honoured.
  const otherFamily = "7d0c3888-16c8-4144-b088-428f38a7e93a";
  const targeted = FAMILY && FAMILY !== otherFamily;
  const r = await callTool("remember_task", {
    title: `${TITLE} (cross-family)`,
    due_at: DUE_AT,
    family_id: otherFamily,
  });

  if (r.payload?.id) written.push(r.payload.id);
  const rows = r.payload?.id
    ? await service(`tasks?select=id,family_id&id=eq.${r.payload.id}`)
    : [];
  if (targeted) {
    check("a family_id in the arguments is ignored, not honoured",
      !rows?.[0] || rows[0].family_id === FAMILY,
      `row landed in ${rows?.[0]?.family_id}, caller's family is ${FAMILY}`);
    check("nothing was written into the other family",
      !rows?.[0] || rows[0].family_id !== otherFamily,
      `row landed in the other family`);
  } else {
    check("cross-family check ran against a different family",
      false,
      `this token belongs to ${FAMILY}; run with the fixture token so the "other" family is genuinely other`);
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
for (const id of written) {
  await service(`tasks?id=eq.${id}`, { method: "DELETE" });
}
const afterTasks = (await service(`tasks?select=id`)) ?? [];
check("every row written was cleaned up", afterTasks.length === beforeTasks.length,
  `tasks went ${beforeTasks.length} -> ${afterTasks.length}`);

console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);
if (failures.length) {
  for (const f of failures) console.log("  FAILED:", f);
  process.exit(1);
}
