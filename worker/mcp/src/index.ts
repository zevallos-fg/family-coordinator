// Family Co AI — remote MCP server (Streamable HTTP, JSON-RPC 2.0).
//
// One endpoint: POST /mcp. Every call is authenticated by a connector token that
// maps to exactly one Supabase user; the server then mints a 5-minute JWT for that
// user, exchanges her stored refresh token for a real access token, and talks to
// PostgREST as her — so RLS, not this code, decides what is readable and writable.
//
// There is no service-role credential here, and no signing secret: this worker can
// only present tokens it was given, never tokens it made up.

import { AuthError, Env, getAccessToken, resolveUserId } from "./auth";
import { SupabaseError, UserClient } from "./supabase";
import { HANDLERS, TOOL_DEFINITIONS, ToolError } from "./tools";

const SERVER_INFO = { name: "familyco-mcp", version: "0.1.0" };

/**
 * Two eras, served side by side.
 *
 * Modern (2026-07-28) carries version, identity and capabilities as per-request
 * `_meta` and has no session. Legacy establishes one with an `initialize`
 * handshake. This server is dual-era: "A dual-era server selects its behavior
 * from how the client opens."
 *
 * Statelessness — the expensive half of the modern revision — was already true
 * here: nothing about a caller survives a request except the KV-cached access
 * token, which is keyed by user and not by connection.
 */
const MODERN_PROTOCOLS = ["2026-07-28"];
const LEGACY_PROTOCOLS = ["2025-06-18", "2025-03-26"];
const SUPPORTED_PROTOCOLS = [...MODERN_PROTOCOLS, ...LEGACY_PROTOCOLS];

/**
 * A request that declares no version at all.
 *
 * Permitted: "A server that supports clients implementing protocol versions
 * earlier than 2025-06-18 (which did not define the MCP-Protocol-Version header)
 * MAY treat a request that omits the header as protocol version 2025-03-26."
 *
 * Taken deliberately rather than rejecting: curl, the acceptance suite and every
 * legacy client send no version, and turning those into 400s would break working
 * callers to satisfy a rule that explicitly allows this.
 */
const ASSUMED_WHEN_ABSENT = "2025-03-26";

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_CAPS = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

/** Error codes the MCP specification reserves in -32020..-32099. */
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

interface RpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Every result carries `resultType` and the server's identity.
 *
 * `resultType` is required from 2026-07-28 on. It is emitted for legacy callers
 * too: a JSON-RPC result is an object and an unrecognised member is ignored, so
 * one shape serves both eras rather than two that can drift apart.
 */
function rpcResult(id: RpcRequest["id"], result: unknown) {
  let payload = result;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const r = payload as Record<string, unknown>;
    payload = {
      resultType: "complete",
      ...r,
      _meta: { [META_SERVER_INFO]: SERVER_INFO, ...((r._meta as object) ?? {}) },
    };
  }
  return json({ jsonrpc: "2.0", id, result: payload });
}

function rpcError(id: RpcRequest["id"], code: number, message: string, status = 200) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status);
}

/** A spec-defined error, which unlike the plain form carries structured `data`. */
function rpcSpecError(
  id: RpcRequest["id"],
  code: number,
  message: string,
  data: unknown,
  status: number
) {
  return json({ jsonrpc: "2.0", id, error: { code, message, data } }, status);
}

/**
 * `Mcp-Name` and `Mcp-Param-*` may arrive Base64-wrapped when the value cannot
 * be represented as a plain ASCII header. Servers "MUST decode an encoded
 * Mcp-Name ... before comparing it to the corresponding request body value".
 */
function decodeHeaderValue(value: string): string {
  const wrapped = /^=\?base64\?(.*)\?=$/.exec(value);
  if (!wrapped) return value;
  try {
    const bytes = Uint8Array.from(atob(wrapped[1]), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/** Tool results are content blocks; isError lets the model see a failure as text. */
function toolContent(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      // Deliberately says nothing about configuration or identity.
      return json({ ok: true, server: SERVER_INFO.name });
    }

    // The MCP endpoint is whatever URL the connector was configured with — the
    // spec says only "a single HTTP endpoint path ... that supports POST", and
    // the example `https://example.com/mcp` is an example, not a requirement.
    // Claude.ai was configured with the bare origin and posted every request to
    // "/", where the old `pathname !== "/mcp"` check 404'd it before routing,
    // auth, or anything else could run. Both are served now: "/mcp" keeps
    // working for anything already pointed at it.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/" && path !== "/mcp") return json({ error: "not found" }, 404);

    // No GET/SSE stream. Revision 2026-07-28 removed the standalone GET stream
    // outright, and tells a server that implements only this shape to answer
    // "HTTP GET or DELETE to the MCP endpoint: respond with 405 Method Not
    // Allowed". A client probing with `Accept: text/event-stream` needs that 405
    // to move on; a 404 reads as "wrong URL" and it gives up on the endpoint.
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    }

    let body: RpcRequest;
    try {
      body = (await request.json()) as RpcRequest;
    } catch {
      return rpcError(null, -32700, "parse error: body is not JSON");
    }
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
      return rpcError(body?.id ?? null, -32600, "invalid request");
    }

    // Notifications carry no id and expect no body.
    const isNotification = body.id === undefined || body.id === null;

    // ---- Era detection and protocol-version validation ----------------------
    //
    // This block exists because of a real defect: the server answered a request
    // declaring 2026-07-28 — and one declaring 1900-01-01 — with HTTP 200 and
    // resultType "complete", claiming to have completed a request in a protocol
    // version it does not implement, while the body's supportedVersions said
    // otherwise. A client given a success has no defined error to act on.
    //
    // `initialize` is exempt by definition: "An initialize request selects
    // legacy semantics."
    let modern = false;
    if (body.method !== "initialize") {
      const versionHeader = request.headers.get("MCP-Protocol-Version");
      const meta = (body.params?._meta ?? {}) as Record<string, unknown>;
      const versionMeta = typeof meta[META_VERSION] === "string" ? (meta[META_VERSION] as string) : null;

      // "The header value MUST match the io.modelcontextprotocol/protocolVersion
      // field carried in the request body's _meta. If the values do not match,
      // the server MUST reject the request with 400 Bad Request and a
      // HeaderMismatch JSON-RPC error." The point is that an intermediary may
      // route on the header while this worker executes on the body.
      if (versionHeader && versionMeta && versionHeader !== versionMeta) {
        return rpcSpecError(
          body.id,
          HEADER_MISMATCH,
          `Header mismatch: MCP-Protocol-Version header '${versionHeader}' does not match body value '${versionMeta}'`,
          { header: "MCP-Protocol-Version" },
          400
        );
      }

      const declared = versionMeta ?? versionHeader ?? ASSUMED_WHEN_ABSENT;

      if (!SUPPORTED_PROTOCOLS.includes(declared)) {
        return rpcSpecError(
          body.id,
          UNSUPPORTED_PROTOCOL_VERSION,
          "Unsupported protocol version",
          { supported: SUPPORTED_PROTOCOLS, requested: declared },
          400
        );
      }

      modern = MODERN_PROTOCOLS.includes(declared);

      if (modern) {
        // "A request missing any required field is malformed; the server MUST
        // reject it with JSON-RPC error code -32602 (Invalid params). On HTTP,
        // the response status MUST be 400 Bad Request."
        if (!versionMeta) {
          return rpcError(body.id, -32602, `Invalid params: params._meta['${META_VERSION}'] is required`, 400);
        }
        if (meta[META_CLIENT_CAPS] === undefined) {
          return rpcError(body.id, -32602, `Invalid params: params._meta['${META_CLIENT_CAPS}'] is required`, 400);
        }

        // Mcp-Method is REQUIRED on all requests and mirrors `method`.
        const methodHeader = request.headers.get("Mcp-Method");
        if (!methodHeader) {
          return rpcSpecError(body.id, HEADER_MISMATCH, "Header mismatch: Mcp-Method header is required", { header: "Mcp-Method" }, 400);
        }
        if (methodHeader !== body.method) {
          return rpcSpecError(
            body.id,
            HEADER_MISMATCH,
            `Header mismatch: Mcp-Method header value '${methodHeader}' does not match body value '${body.method}'`,
            { header: "Mcp-Method" },
            400
          );
        }

        // Mcp-Name is REQUIRED for tools/call and mirrors params.name.
        if (body.method === "tools/call") {
          const nameHeader = request.headers.get("Mcp-Name");
          const bodyName = typeof body.params?.name === "string" ? body.params.name : "";
          if (!nameHeader) {
            return rpcSpecError(body.id, HEADER_MISMATCH, "Header mismatch: Mcp-Name header is required for tools/call", { header: "Mcp-Name" }, 400);
          }
          if (decodeHeaderValue(nameHeader) !== bodyName) {
            return rpcSpecError(
              body.id,
              HEADER_MISMATCH,
              `Header mismatch: Mcp-Name header value does not match body value '${bodyName}'`,
              { header: "Mcp-Name" },
              400
            );
          }
        }
      }
    }

    // ---- Unauthenticated surface -------------------------------------------
    // Only the handshake. Everything that can touch data is gated below.
    switch (body.method) {
      case "initialize": {
        const asked = (body.params?.protocolVersion as string) ?? SUPPORTED_PROTOCOLS[0];
        return rpcResult(body.id, {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
      }
      // Revision 2026-07-28 removed the initialize handshake and made every
      // request self-contained, so a modern client opens with this instead:
      // "server/discover lets a client query a server's supported protocol
      // versions, capabilities, and identity before sending any other requests.
      // Servers MUST implement it."
      //
      // We answer with the versions we actually implement, and deliberately do
      // NOT claim 2026-07-28. Advertising a version we do not speak would invite
      // per-request `_meta`, Mcp-Method/body validation and `resultType` results
      // we have not built. The client is expected to "select a mutually
      // supported version from the `supported` list and retry", which lands it
      // on the initialize path below.
      case "server/discover":
        return rpcResult(body.id, {
          supportedVersions: SUPPORTED_PROTOCOLS,
          capabilities: { tools: {} },
          instructions:
            "Family Co AI: household memory for one family. Tools write facts, " +
            "decisions, terms and corrections, and read what is due. Every call " +
            "is scoped by RLS to the family of the connector token presented.",
        });

      case "notifications/initialized":
      case "notifications/cancelled":
        return new Response(null, { status: 202 });
      case "ping":
        return rpcResult(body.id, {});
    }

    // ---- Authenticated surface ---------------------------------------------
    // Unknown methods are refused before the auth gate, not after.
    //
    // "If the server does not implement the requested RPC method, it MUST respond
    // with 404 Not Found and a JSON-RPC error with code -32601" — and a dual-era
    // client uses exactly that to tell a modern server from a legacy one. Behind
    // the gate it answered 401 instead, which tells a prober nothing about which
    // era it is talking to.
    //
    // Nothing leaks by answering first: these are the protocol's own method
    // names, identical on every MCP server. What is actually private — the tool
    // list, and every tool result — stays behind the gate below.
    const AUTHENTICATED_METHODS = new Set(["tools/list", "tools/call"]);
    if (!AUTHENTICATED_METHODS.has(body.method)) {
      if (isNotification) return new Response(null, { status: 202 });
      return rpcError(body.id, -32601, `Method not found: ${body.method}`, 404);
    }

    // Which credential arrived, without ever logging one.
    //
    // Cloudflare's log stream redacts the Authorization header, so "a bearer
    // token is present" is all it can tell us — not whether it is the token we
    // issued. A short SHA-256 prefix is comparable against a locally computed
    // fingerprint of the known tokens and is not reversible into the token.
    // Remove this once the connector is working; it exists to answer one
    // question and should not outlive it.
    {
      const raw = (request.headers.get("Authorization") ?? "").trim();

      // Split scheme from credential ONLY on a well-formed `<scheme> <value>`.
      // The previous version printed `raw.split(" ")[0]` as the scheme, which for
      // a header sent without a scheme is the entire credential — and it logged
      // one in cleartext the first time a client sent a bare token. Never print
      // any part of this header again: a scheme is echoed only when it matches
      // the RFC 9110 token grammar, and everything else is fingerprinted.
      const parts = /^([A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*)[ \t]+(.+)$/.exec(raw);
      const scheme = parts ? parts[1] : raw ? "(absent — value sent with no scheme)" : "-";
      const credential = parts ? parts[2].trim() : raw;

      let fp = "none";
      if (credential) {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credential));
        fp = [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
      }

      console.log(
        `mcp auth probe path=${path} method=${body.method} ` +
          `authz=${raw ? "present" : "absent"} scheme=${scheme} ` +
          `token_sha256_prefix=${fp} len=${credential.length} ` +
          `mcp-protocol-version=${request.headers.get("MCP-Protocol-Version") ?? "-"} ` +
          `mcp-method=${request.headers.get("Mcp-Method") ?? "-"}`
      );
    }

    let userId: string;
    try {
      userId = await resolveUserId(request.headers.get("Authorization"), env.CONNECTOR_TOKEN_MAP ?? "{}");
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      // 401 with a challenge, never a silent empty result: a caller that is not
      // recognised has to be told, or a misconfigured connector looks like an
      // account with no data.
      if (isNotification) return new Response(null, { status: 401 });
      return json(
        {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32001, message: `unauthorized: ${err.message}` },
        },
        401,
        { "WWW-Authenticate": 'Bearer realm="familyco-mcp"' }
      );
    }

    switch (body.method) {
      case "tools/list":
        return rpcResult(body.id, { tools: TOOL_DEFINITIONS });

      case "tools/call": {
        const name = body.params?.name as string;
        const args = (body.params?.arguments as Record<string, unknown>) ?? {};
        const handler = HANDLERS[name];
        if (!handler) return rpcError(body.id, -32602, `unknown tool: ${name}`);

        try {
          // A real access token for this user, obtained by exchanging her stored
          // refresh token. This worker holds no signing secret and cannot mint one.
          const accessToken = await getAccessToken(userId, env);
          const db = new UserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, accessToken);
          const familyId = await db.familyId(userId);
          const result = await handler(db, userId, familyId, args);
          return rpcResult(body.id, toolContent(result));
        } catch (err) {
          // Validation and RLS refusals come back as readable tool errors so the
          // model can correct itself; anything else is not detailed to the caller.
          if (err instanceof ToolError || err instanceof SupabaseError) {
            return rpcResult(body.id, toolContent({ error: err.message }, true));
          }
          if (err instanceof AuthError) {
            return rpcError(body.id, -32001, `unauthorized: ${err.message}`, 401);
          }
          console.error("mcp tool failure", name, err);
          return rpcResult(body.id, toolContent({ error: "internal error" }, true));
        }
      }
    }

    if (isNotification) return new Response(null, { status: 202 });

    // "If the server does not implement the requested RPC method, it MUST
    // respond with 404 Not Found and a JSON-RPC error with code -32601. The
    // JSON-RPC error body distinguishes this case from a 404 returned by a
    // legacy HTTP+SSE server that does not host the modern MCP endpoint."
    //
    // This used to answer 200, which made an unimplemented method look like a
    // successful exchange to anything reading the status alone.
    return rpcError(body.id, -32601, `Method not found: ${body.method}`, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const res = await route(request, env);

    // What the client actually received. The probe above records what arrived;
    // without this we could see a well-formed request carrying the right token
    // and still not know whether it was answered with eight tools or a refusal.
    // Cloudflare's request log shows the URL and nothing else.
    //
    // Temporary, like the probe. Cloning is safe here — every response this
    // worker produces is a small JSON document, and the body is read only to
    // measure it. Tool names are not secret; a JSON-RPC error message is the
    // thing worth seeing, so non-2xx bodies are logged in full up to 300 chars.
    let bytes = -1;
    let detail = "";
    try {
      const text = await res.clone().text();
      bytes = text.length;
      if (res.status >= 400) detail = ` body=${text.slice(0, 300)}`;
    } catch {
      detail = " body=<unreadable>";
    }

    console.log(
      `mcp resp ${new URL(request.url).pathname} ${request.method} ` +
        `status=${res.status} bytes=${bytes} ms=${Date.now() - started}${detail}`
    );

    return res;
  },
};
