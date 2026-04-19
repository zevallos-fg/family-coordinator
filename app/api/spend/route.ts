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

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return Response.json({ spend: null });

  const cacheKey = membership.family_id;
  const cached = spendCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ spend: cached.value, cached: true });
  }

  const { data: cents } = await supabase.rpc("fn_skill_get_monthly_spend", {
    target_family_id: membership.family_id,
  });

  const spend = (Number(cents ?? 0) / 100).toFixed(2);
  spendCache.set(cacheKey, { value: spend, expiresAt: Date.now() + CACHE_TTL_MS });

  return Response.json({ spend, cached: false });
}
