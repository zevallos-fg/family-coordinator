import { createClient } from "@/lib/supabase/server";

// In-memory cache keyed by family_id. Deduplicates Supabase RPC calls when
// multiple clients or concurrent requests poll within the TTL window.
const spendCache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 second server-side cache

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ spend: null });

  const { data: membership, error: membershipError } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("[api/spend] membership lookup failed", membershipError.message);
    return Response.json({ spend: null, unavailable: true }, { status: 503 });
  }
  if (!membership) return Response.json({ spend: null });

  const cacheKey = membership.family_id;
  const cached = spendCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ spend: cached.value, cached: true });
  }

  const { data: cents, error } = await supabase.rpc("fn_skill_get_monthly_spend", {
    target_family_id: membership.family_id,
  });

  // A spend query that fails used to report $0.00 of $10.00 and cache it for a
  // minute. This is a budget control: failing toward "plenty left" is the one
  // direction it must never fail in, and caching that answer made a transient
  // error look like a healthy month for as long as the TTL held.
  if (error || cents === null) {
    console.error("[api/spend] could not read monthly spend", {
      familyId: membership.family_id,
      error: error?.message ?? "rpc returned null",
    });
    return Response.json({ spend: null, unavailable: true }, { status: 503 });
  }

  const spend = (Number(cents) / 100).toFixed(2);
  spendCache.set(cacheKey, { value: spend, expiresAt: Date.now() + CACHE_TTL_MS });

  return Response.json({ spend, cached: false });
}
