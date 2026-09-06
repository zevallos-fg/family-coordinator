"use server";

import { createClient } from "@/lib/supabase/server";
import { isDeadLink } from "@/lib/caregiver-share";

/**
 * The one write a caregiver can make, and the first time they have been able to
 * make it.
 *
 * Kept in its own file rather than added to app/(app)/caregiver/actions.ts:
 * everything in there runs behind getAuthedFamily(), and a public action sitting
 * among them is the kind of thing that gets a family-scoped helper bolted onto it
 * six months later. This file is the public surface, and it is one function.
 *
 * The token is the only identifier. There is no shift id to supply and therefore
 * none to tamper with — the previous version took a raw shift UUID from the
 * client and handed it straight to an insert that RLS then refused anyway.
 */
export async function submitSharedRecap(
  token: string,
  text: string
): Promise<{ ok: true; submittedAt: string } | { ok: false; error: string }> {
  if (!text.trim()) {
    return { ok: false, error: "Please write a little about the day first." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_share_submit_recap", {
    p_token: token,
    p_text: text.trim(),
  });

  if (error) {
    if (isDeadLink(error.message)) {
      return {
        ok: false,
        error: "This link has expired. Ask the family for a new one.",
      };
    }
    if (/too long/i.test(error.message)) {
      return { ok: false, error: "That is a bit long — 5000 characters maximum." };
    }
    console.error("[submitSharedRecap] failed", error.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true, submittedAt: data ?? new Date().toISOString() };
}
