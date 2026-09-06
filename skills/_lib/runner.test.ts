// Regression tests for the silent-200 failure.
//
// From 2026-04-19 to 2026-09-06 the production Anthropic key was invalid. Every
// skill call still "succeeded": the Worker returned HTTP 200 wrapping Anthropic's
// error body, so `response.ok` was true here, `usage.input_tokens ?? 0` read 0 off
// an error payload, and a clean zero-token row went into api_usage with no
// error_message. Nothing surfaced in the UI, in api_usage, or in PostHog.
//
// These tests assert the loudness, not the happy path. What matters is that a
// broken key cannot be mistaken for a working one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillContext } from "./types";

vi.mock("server-only", () => ({}));

vi.mock("posthog-node", () => {
  class PostHog {
    capture = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);
  }
  return { PostHog };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));

const USER_ID = "a0000000-0000-4000-8000-000000000002";
const FAMILY_ID = "a0000000-0000-4000-8000-000000000001";

/** Every rpc call the runner makes, in order. */
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;

const supabaseMock = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { session: { access_token: "test-access-token" } } }),
  },
  rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === "fn_skill_get_monthly_spend") return { data: 0, error: null };
    if (fn === "fn_skill_record_usage") return { data: "usage-row-id", error: null };
    return { data: null, error: null };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supabaseMock),
}));

import { callSkill } from "./runner";

const ctx: SkillContext = { familyId: FAMILY_ID, userId: USER_ID };

const opts = {
  skillName: "family-capture-router",
  tier: "haiku" as const,
  messages: [{ role: "user" as const, content: "milk and eggs" }],
  maxTokens: 300,
};

/** The exact body Anthropic returns for a revoked or missing key. */
const ANTHROPIC_AUTH_ERROR = {
  type: "error",
  error: { type: "authentication_error", message: "API key is invalid." },
};

function usageRows() {
  return rpcCalls.filter((c) => c.fn === "fn_skill_record_usage");
}
function diagnosticsCalls() {
  return rpcCalls.filter((c) => c.fn === "fn_skill_update_diagnostics");
}

beforeEach(() => {
  rpcCalls = [];
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "test-access-token" } },
  });
});

describe("callSkill — upstream failures are loud", () => {
  it("treats a 200 carrying an Anthropic error body as a failure", async () => {
    // The exact regression: the old Worker's response for an invalid key.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(ANTHROPIC_AUTH_ERROR), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const result = await callSkill(opts, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("api_error");
    // The upstream reason has to survive into the message, or the operator is
    // left guessing which of several things broke.
    expect(result.error.message).toContain("API key is invalid.");
  });

  it("writes a populated error_message to api_usage on a silent 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(ANTHROPIC_AUTH_ERROR), { status: 200 })
      )
    );

    await callSkill(opts, ctx);

    // A row is still written — the call is part of the audit trail.
    expect(usageRows()).toHaveLength(1);
    expect(usageRows()[0].args.p_input_tokens).toBe(0);
    expect(usageRows()[0].args.p_cost_cents).toBe(0);

    // ...and it is marked as an error. This is the assertion that would have
    // caught the outage: 7 such rows existed with p_error_message never set.
    const diag = diagnosticsCalls();
    expect(diag).toHaveLength(1);
    expect(diag[0].args.p_error_message).toBeTruthy();
    expect(String(diag[0].args.p_error_message)).toContain("API key is invalid.");
  });

  it("never records a zero-token call as a success", async () => {
    // Any 200 with no usage block, error body or not.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ text: "" }] }), { status: 200 }))
    );

    const result = await callSkill(opts, ctx);

    expect(result.ok).toBe(false);
    expect(diagnosticsCalls()[0]?.args.p_error_message).toBeTruthy();
    // No row may claim a success with zero tokens.
    for (const row of usageRows()) {
      const zero = row.args.p_input_tokens === 0;
      const marked = diagnosticsCalls().some((d) => d.args.p_error_message);
      expect(zero && !marked).toBe(false);
    }
  });

  it("logs a failure row when the Worker itself returns non-200", async () => {
    // What the hardened Worker now does for an invalid key: pass the upstream
    // status through, tagged with X-Upstream-Error.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(ANTHROPIC_AUTH_ERROR), {
          status: 401,
          headers: { "X-Upstream-Error": "anthropic" },
        })
      )
    );

    const result = await callSkill(opts, ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Names the upstream, so a 401 here is not mistaken for the proxy's own
    // auth gate rejecting the session.
    expect(result.error.message).toContain("anthropic");
    expect(usageRows()).toHaveLength(1);
    expect(diagnosticsCalls()[0]?.args.p_error_message).toBeTruthy();
  });

  it("logs a failure row when the Worker is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const result = await callSkill(opts, ctx);

    expect(result.ok).toBe(false);
    expect(usageRows()).toHaveLength(1);
    expect(String(diagnosticsCalls()[0]?.args.p_error_message)).toContain("unreachable");
  });

  it("still succeeds, and records real cost, on a genuine completion", async () => {
    // The guard must not reject working calls.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ text: '{"isGrocery":true}' }],
            usage: { input_tokens: 1200, output_tokens: 80 },
          }),
          { status: 200 }
        )
      )
    );

    const result = await callSkill(opts, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data).toBe('{"isGrocery":true}');
    expect(usageRows()).toHaveLength(1);
    expect(usageRows()[0].args.p_input_tokens).toBe(1200);
    expect(Number(usageRows()[0].args.p_cost_cents)).toBeGreaterThan(0);
    // Diagnostics still run, but carry a preview rather than an error.
    expect(diagnosticsCalls()[0]?.args.p_error_message).toBeUndefined();
  });
});
