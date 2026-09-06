import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Only the flows this app actually starts. signInWithOtp defaults to
// shouldCreateUser, so a first-time address arrives as "signup" and a returning
// one as "magiclink"; nothing here initiates recovery or email_change, and an
// unrestricted `type` would let the route verify any flow enabled on the project.
const ALLOWED_OTP_TYPES = ["magiclink", "signup"] as const satisfies readonly EmailOtpType[];

function isAllowedOtpType(value: string | null): value is (typeof ALLOWED_OTP_TYPES)[number] {
  return value !== null && (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/onboarding";

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));

  if (!code && !tokenHash) return fail("auth_failed");

  const supabase = await createClient();

  // Supabase emits two shapes of email link. A PKCE link arrives as ?code= and is
  // exchanged against the code_verifier cookie the browser client stored. A
  // token_hash link carries a hashed one-time OTP verified server-side, with no
  // verifier needed — that is what admin-generated links and several of the stock
  // email templates produce, and the e2e fixture signs in through this branch.
  let error;
  if (tokenHash) {
    if (!isAllowedOtpType(type)) return fail("auth_type_not_allowed");
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    ({ error } = await supabase.auth.exchangeCodeForSession(code!));
  }

  if (error) return fail("auth_failed");

  // Upsert user row now that we have a valid session
  const { data: authData } = await supabase.auth.getUser();
  if (authData?.user) {
    const { user } = authData;
    // family_members.user_id points at public.users, so a lost upsert here means
    // the next page load finds no membership and sends a returning user through
    // onboarding again. Signing in has already succeeded, so this is logged
    // rather than fatal — but it is no longer invisible.
    const { error: upsertError } = await supabase.from("users").upsert({
      id: user.id,
      email: user.email!,
      full_name: user.user_metadata.full_name ?? null,
      avatar_url: user.user_metadata.avatar_url ?? null,
    });

    if (upsertError) {
      console.error("[auth/callback] users upsert failed", {
        userId: user.id,
        error: upsertError.message,
      });
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
