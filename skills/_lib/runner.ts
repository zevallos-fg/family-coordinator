import "server-only";

import { PostHog } from "posthog-node";
import { createClient } from "@/lib/supabase/server";
import type { SkillContext, SkillResult, SkillTier } from "./types";

const posthogClient = process.env.NEXT_PUBLIC_POSTHOG_KEY
  ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

/**
 * Pricing per 1M tokens, USD.
 * Update if Anthropic pricing changes.
 */
const PRICING = {
  [HAIKU_MODEL]: { input: 0.25, output: 1.25 },
  [SONNET_MODEL]: { input: 3.0, output: 15.0 },
} as const;

/** $10/family/month hard cap. Enforced pre-flight via RPC. */
const PER_FAMILY_MONTHLY_CAP_CENTS = 1000;

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL!;


/**
 * Report a parse/validation error against an existing api_usage row.
 * Call this after a skill returns ok:true but the caller fails to parse the data.
 * Silently no-ops if usageId is undefined (e.g., usage logging itself failed).
 */
export async function updateSkillError(
  usageId: string | undefined,
  errorMessage: string
): Promise<void> {
  if (!usageId) return;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_skill_update_diagnostics", {
    p_usage_id: usageId,
    p_error_message: errorMessage,
  });
  if (error) console.error("[skillRunner] updateSkillError failed", error.message);
}

export type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source:
            | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
            | { type: "url"; url: string };
        }
    >;

export interface SkillCallOptions {
  skillName: string;
  tier: SkillTier;
  messages: Array<{ role: "user" | "assistant"; content: MessageContent }>;
  maxTokens: number;
  system?: string;
}


/**
 * Core skill call. Every skill routes through this function.
 *
 * Architecture (see /skills/README.md for full docs):
 * 1. Use authenticated user's Supabase session (NOT service role).
 * 2. Pre-flight: call fn_skill_get_monthly_spend RPC to check budget.
 * 3. If under budget, call Worker proxy with the Anthropic request.
 * 4. Post-flight: call fn_skill_record_usage RPC to log tokens + cost.
 *
 * Both RPC functions are SECURITY DEFINER and verify caller membership.
 * A compromised Next.js server can only call these two specific functions —
 * it cannot read or write any other tables.
 */
export async function callSkill<T = string>(
  opts: SkillCallOptions,
  ctx: SkillContext
): Promise<SkillResult<T>> {
  const { skillName, tier, messages, maxTokens, system } = opts;
  const model = tier === "sonnet" ? SONNET_MODEL : HAIKU_MODEL;
  const supabase = await createClient();

  // 1. Verify authenticated user matches claimed userId
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user || authData.user.id !== ctx.userId) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "no session or user mismatch" },
    };
  }

  // 2. Pre-flight budget check via RPC
  const { data: spentCents, error: spendErr } = await supabase.rpc(
    "fn_skill_get_monthly_spend",
    { target_family_id: ctx.familyId }
  );

  if (spendErr) {
    return {
      ok: false,
      error: { code: "unknown", message: `budget check failed: ${spendErr.message}` },
    };
  }

  const spent = Number(spentCents ?? 0);
  if (spent >= PER_FAMILY_MONTHLY_CAP_CENTS) {
    return {
      ok: false,
      error: {
        code: "budget_exceeded",
        message: `Family monthly API budget exceeded ($${(spent / 100).toFixed(2)} / $${(PER_FAMILY_MONTHLY_CAP_CENTS / 100).toFixed(2)})`,
      },
    };
  }

  // 3. Call the Worker proxy
  let body: {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  // The Worker verifies this token against the project's JWKS and rate-limits per
  // `sub`, so the proxy is no longer callable without a session. getUser() above
  // already validated it against the auth server; this reads the same token back
  // out of the cookie to forward it.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "no access token to authenticate the proxy call" },
    };
  }

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Family-Id": ctx.familyId,
        "X-Skill-Name": skillName,
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: { code: "api_error", message: `Worker ${response.status}: ${text}` },
      };
    }

    body = await response.json();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "api_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // 4. Compute cost and log via RPC; capture the returned usage row ID
  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  const pricing = PRICING[model as keyof typeof PRICING];
  const costCents =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 10000;

  const { data: usageId, error: logErr } = await supabase.rpc("fn_skill_record_usage", {
    target_family_id: ctx.familyId,
    target_user_id: ctx.userId,
    p_skill_name: skillName,
    p_model: model,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_cents: costCents,
  });

  if (logErr) {
    console.error("[skillRunner] usage logging failed", {
      skillName,
      error: logErr.message,
    });
  }

  const text = body.content?.[0]?.text ?? "";

  // 4b. Store response_preview (first 500 chars) for diagnostics
  if (usageId) {
    supabase.rpc("fn_skill_update_diagnostics", {
      p_usage_id: usageId,
      p_response_preview: text.slice(0, 500),
    }).then(({ error }) => {
      if (error) console.error("[skillRunner] diagnostics update failed", error.message);
    });
  }

  // 5. Emit PostHog event (serverless: flush immediately)
  if (posthogClient) {
    posthogClient.capture({
      distinctId: ctx.userId,
      event: "skill.invoked",
      properties: {
        skill_name: skillName,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_cents: costCents,
        family_id: ctx.familyId,
      },
    });
    await posthogClient.shutdown();
  }

  // 6. Return text content + usageId so callers can report parse errors
  return {
    ok: true,
    data: text as unknown as T,
    usage: { model, inputTokens, outputTokens, costCents },
    usageId: usageId ?? undefined,
  };
}