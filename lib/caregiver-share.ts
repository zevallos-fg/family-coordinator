import type { Database } from "@/lib/supabase/database.types";

/**
 * What is left of the temporary module.
 *
 * The cast is gone: migration 20260906_caregiver_share_tokens is applied and
 * `supabase gen types` now describes fn_share_read_shift, fn_share_submit_recap
 * and the five-argument fn_share_create, so the call sites are typed by the
 * generated file like everything else. That was the promise in the comment this
 * replaces, and it is kept.
 *
 * Two things survive, both of which the generator genuinely cannot know.
 */

type GeneratedRow =
  Database["public"]["Functions"]["fn_share_read_shift"]["Returns"][number];

/**
 * `gen types` types every column of a RETURNS TABLE as non-null, because a
 * function's signature carries no nullability. Four of these come from LEFT JOINs
 * and one from a nullable column, so they very much can be null — and treating
 * `brief_content` as a guaranteed string is how a shift with no brief yet becomes
 * a blank panel instead of "no brief has been generated yet".
 */
export type SharedShift = Omit<
  GeneratedRow,
  "brief_content" | "brief_generated_at" | "recap_transcription" | "recap_submitted_at" | "kid_names"
> & {
  kid_names: string[] | null;
  brief_content: string | null;
  brief_generated_at: string | null;
  recap_transcription: string | null;
  recap_submitted_at: string | null;
};

/**
 * Postgres raises one exception for not-found, expired and revoked alike — the
 * vagueness is deliberate, so the page cannot be used to confirm which tokens
 * ever existed. This keeps that property on the way out.
 */
export function isDeadLink(message: string): boolean {
  return /link not found, expired, or revoked|insufficient_privilege/i.test(message);
}
