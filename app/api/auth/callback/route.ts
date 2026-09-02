import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/onboarding";

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  const supabase = await createClient();

  // Supabase emits two shapes of email link. A PKCE link arrives as ?code= and is
  // exchanged against the code_verifier cookie the browser client stored. A
  // token_hash link carries a hashed one-time OTP verified server-side, with no
  // verifier needed — that is what admin-generated links and several of the stock
  // email templates produce, and the e2e fixture signs in through this branch.
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ type: type ?? "magiclink", token_hash: tokenHash })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  // Upsert user row now that we have a valid session
  const { data: authData } = await supabase.auth.getUser();
  if (authData?.user) {
    const { user } = authData;
    await supabase.from("users").upsert({
      id: user.id,
      email: user.email!,
      full_name: user.user_metadata.full_name ?? null,
      avatar_url: user.user_metadata.avatar_url ?? null,
    });
  }

  return NextResponse.redirect(new URL(next, request.url));
}
