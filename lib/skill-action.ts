import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  SkillContext,
  SkillResult,
  SkillRunner,
} from "@/skills/_lib/types";

/**
 * Wraps a skill runner into a function that auto-derives the SkillContext from
 * the authenticated user's session.
 *
 * Usage from a Server Action:
 *   const result = await withSkillContext(captureRouter.run, { text: "..." });
 *
 * Returns an `unauthenticated` error if no session or the user has no family.
 * Every feature track should call its skills through this helper rather than
 * constructing SkillContext manually.
 */
export async function withSkillContext<TInput, TOutput>(
  runner: SkillRunner<TInput, TOutput>,
  input: TInput
): Promise<SkillResult<TOutput>> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "not signed in" },
    };
  }

  // Find the user's family. Assumes single-family-per-user for MVP.
  // A user can belong to multiple families in principle; we pick the
  // first one they joined. Extension path: pass familyId explicitly
  // once users can belong to >1 family.
  const { data: membership, error: membershipError } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", authData.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return {
      ok: false,
      error: {
        code: "unknown",
        message: `membership lookup failed: ${membershipError.message}`,
      },
    };
  }

  if (!membership) {
    return {
      ok: false,
      error: {
        code: "unauthorized",
        message: "user has no family yet (complete onboarding first)",
      },
    };
  }

  const ctx: SkillContext = {
    familyId: membership.family_id,
    userId: authData.user.id,
  };

  return runner(input, ctx);
}
