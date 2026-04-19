import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FamilySettingsForm } from "@/components/settings/FamilySettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, families(name, default_serves)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const family = membership.families as { name: string; default_serves: number } | null;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-400 mt-0.5">Family preferences</p>
      </div>
      <FamilySettingsForm
        familyId={membership.family_id}
        defaultServes={family?.default_serves ?? 4}
      />
    </div>
  );
}
