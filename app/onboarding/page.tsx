import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // If user already has a family, send them to the dashboard
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/dashboard");

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome! Let's set up your household.
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            This takes about 30 seconds.
          </p>
        </div>
        <OnboardingWizard />
      </div>
    </main>
  );
}
