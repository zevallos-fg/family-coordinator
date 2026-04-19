import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, role, families(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { data: spendCents } = await supabase.rpc(
    "fn_skill_get_monthly_spend",
    { target_family_id: membership.family_id }
  );

  const spend = (Number(spendCents ?? 0) / 100).toFixed(2);

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Welcome to {membership.families?.name ?? "your household"}
        </h1>
        <p className="text-sm text-foreground/60 mt-1">
          Signed in as {user.email}
        </p>
      </div>

      <div className="rounded-lg border border-foreground/10 p-4">
        <div className="text-xs uppercase text-foreground/50 tracking-wider">
          This month&apos;s AI usage
        </div>
        <div className="text-2xl font-semibold mt-1">
          ${spend}{" "}
          <span className="text-sm font-normal text-foreground/50">
            / $10.00
          </span>
        </div>
      </div>

      <form action="/api/auth/signout" method="POST">
        <Button variant="outline" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}
