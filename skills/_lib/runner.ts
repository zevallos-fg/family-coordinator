import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SkillContext, SkillResult, SkillTier } from "./types";

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

export interface SkillCallOptions {
  skillName: string;
  tier: SkillTier;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
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

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

  // 4. Compute cost and log via RPC
  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  const pricing = PRICING[model as keyof typeof PRICING];
  const costCents =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 10000;

  const { error: logErr } = await supabase.rpc("fn_skill_record_usage", {
    target_family_id: ctx.familyId,
    target_user_id: ctx.userId,
    p_skill_name: skillName,
    p_model: model,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_cents: costCents,
  });

  if (logErr) {
    // Don't fail the call — the work is done — but log the failure
    console.error("[skillRunner] usage logging failed", {
      skillName,
      error: logErr.message,
    });
  }

  // 5. Return text content (caller parses further if needed)
  const text = body.content?.[0]?.text ?? "";
  return {
    ok: true,
    data: text as unknown as T,
    usage: { model, inputTokens, outputTokens, costCents },
  };
}