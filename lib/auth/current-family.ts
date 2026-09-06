import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The user's family, looked up once, in one place.
 *
 * These six lines were copy-pasted into 48 files, and all 48 copies dropped the
 * error half of the response. That turns a transient failure on family_members
 * into `membership === null`, which every copy reads as "this person has no
 * family" and answers with `redirect("/onboarding")`.
 *
 * /onboarding swallowed the same read, so it agreed, and showed the wizard. A
 * member of a working household could therefore be walked into creating a second
 * one — and because every page picks the *first* family joined, the new family
 * would not even become the active one. The user would get their real household
 * back when the read recovered, plus an orphan family and a duplicate
 * family_members row they never asked for.
 *
 * A failed read is not an answer about who you are. It is the absence of one.
 *
 * The copies also disagreed about ordering: 24 of them omitted
 * `.order("joined_at")`, so for anyone in more than one family, *which* family
 * they saw was whatever Postgres returned first and could change between two
 * requests. There is one ordering here, and it is the same everywhere.
 */

export interface FamilyContext {
  userId: string;
  familyId: string;
}

export type FamilyLookup =
  | ({ ok: true } & FamilyContext)
  | { ok: false; reason: "unauthenticated" }
  | { ok: false; reason: "no-family" }
  | { ok: false; reason: "lookup-failed"; message: string };

/**
 * The raw answer, with the three failures kept apart. Callers that have to
 * return a value rather than navigate — Server Actions, route handlers — use
 * this and decide for themselves.
 */
export async function lookupFamily(): Promise<FamilyLookup> {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return { ok: false, reason: "unauthenticated" };

  const { data: membership, error } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", auth.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "lookup-failed", message: error.message };
  }
  if (!membership) return { ok: false, reason: "no-family" };

  return { ok: true, userId: auth.user.id, familyId: membership.family_id };
}

/**
 * For Server Components.
 *
 * No session -> /login. No family -> /onboarding. Those are answers.
 *
 * A failed lookup throws, so the nearest error boundary renders "we could not
 * load this" with a Try again. That is deliberately not a redirect: sending
 * someone to onboarding because the database blinked is the bug this exists to
 * remove, and a page that cannot establish who is asking must not guess.
 */
export async function requireFamily(): Promise<FamilyContext> {
  const result = await lookupFamily();

  if (result.ok) return { userId: result.userId, familyId: result.familyId };

  // redirect() throws NEXT_REDIRECT, so these must not sit inside a try.
  if (result.reason === "unauthenticated") redirect("/login");
  if (result.reason === "no-family") redirect("/onboarding");

  throw new Error(`Could not load your family: ${result.message}`);
}

/**
 * For Server Actions that answer with a value instead of navigating. Returns
 * the context or a sentence fit to show someone, with "we could not check"
 * kept distinct from "you are not a member".
 */
export async function familyForAction(): Promise<
  { ok: true; context: FamilyContext } | { ok: false; error: string }
> {
  const result = await lookupFamily();

  if (result.ok) {
    return { ok: true, context: { userId: result.userId, familyId: result.familyId } };
  }
  if (result.reason === "unauthenticated") {
    return { ok: false, error: "Not signed in." };
  }
  if (result.reason === "no-family") {
    return { ok: false, error: "No family found. Finish setting up your household first." };
  }
  return {
    ok: false,
    error: "Could not reach your family record, so nothing was changed. Try again.",
  };
}

/**
 * "Is this user a member of *this* family?" — the authorization check, as
 * opposed to "which family is this user in".
 *
 * Failing closed was already the behaviour, and stays. What changes is that a
 * failed check no longer claims the family does not exist.
 */
export async function assertMembership(
  familyId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return { ok: false, error: "Not signed in." };

  const { data: membership, error } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", auth.user.id)
    .eq("family_id", familyId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: "Could not verify your access, so nothing was changed. Try again.",
    };
  }
  if (!membership) return { ok: false, error: "Family not found" };

  return { ok: true, userId: auth.user.id };
}
