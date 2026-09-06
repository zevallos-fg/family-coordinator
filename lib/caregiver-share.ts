import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Typed access to the three share RPCs that migration
 * 20260906_caregiver_share_tokens adds.
 *
 * TEMPORARY, and deliberately small. `supabase gen types` can only describe
 * functions that exist, and that migration is not applied yet — so until it is,
 * these shapes are written by hand and the client is cast in exactly one place.
 * The moment the migration lands, regenerate database.types.ts and delete this
 * file: the generated types will describe all three, and the enum work in PR #9
 * is the whole argument for not keeping a hand-maintained copy around.
 *
 * Nothing here weakens anything. The functions are SECURITY DEFINER and take the
 * token as their only identifier; this module just stops the call sites from
 * being `as any`.
 */

export interface SharedShift {
  label: string;
  caregiver_name: string;
  caregiver_role: string;
  kid_names: string[] | null;
  start_at: string;
  end_at: string;
  brief_content: string | null;
  brief_generated_at: string | null;
  recap_transcription: string | null;
  recap_submitted_at: string | null;
}

export interface MintedShareLink {
  token: string;
  expires_at: string;
}

/** The narrow surface this module needs, so the cast below is one line wide. */
type ShareRpcClient = {
  rpc(
    fn: "fn_share_read_shift",
    args: { p_token: string }
  ): PromiseLike<{ data: SharedShift[] | null; error: { message: string } | null }>;
  rpc(
    fn: "fn_share_submit_recap",
    args: { p_token: string; p_text: string }
  ): PromiseLike<{ data: string | null; error: { message: string } | null }>;
  rpc(
    fn: "fn_share_create",
    args: {
      p_family_id: string;
      p_label: string;
      p_scope: string;
      p_hours: number;
      p_shift_id: string;
    }
  ): PromiseLike<{ data: MintedShareLink[] | null; error: { message: string } | null }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shareRpc(client: SupabaseClient<any, any, any>): ShareRpcClient {
  return client as unknown as ShareRpcClient;
}

/**
 * Postgres raises one exception for not-found, expired and revoked alike — the
 * vagueness is deliberate, so the page cannot be used to confirm which tokens
 * ever existed. This keeps that property on the way out.
 */
export function isDeadLink(message: string): boolean {
  return /link not found, expired, or revoked|insufficient_privilege/i.test(message);
}
