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
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"];

interface RpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: RpcRequest["id"], code: number, message: string, status = 200) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      // Deliberately says nothing about configuration or identity.
      return json({ ok: true, server: SERVER_INFO.name });
    }

    if (url.pathname !== "/mcp") return json({ error: "not found" }, 404);

    // No GET/SSE stream: this server never initiates messages, so there is nothing
    // for a long-lived channel to carry. Say so rather than hanging.
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
      case "notifications/initialized":
      case "notifications/cancelled":
        return new Response(null, { status: 202 });
      case "ping":
        return rpcResult(body.id, {});
    }

    // ---- Authenticated surface ---------------------------------------------
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
          const familyId = await db.familyId();
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
    return rpcError(body.id, -32601, `method not found: ${body.method}`);
  },
};
