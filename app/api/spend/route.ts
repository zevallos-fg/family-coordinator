import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ spend: null });

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return Response.json({ spend: null });

  const { data: cents } = await supabase.rpc("fn_skill_get_monthly_spend", {
    target_family_id: membership.family_id,
  });

  const spend = (Number(cents ?? 0) / 100).toFixed(2);
  return Response.json({ spend });
}
