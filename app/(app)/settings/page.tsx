import { createClient } from "@/lib/supabase/server";
import { FamilySettingsForm } from "@/components/settings/FamilySettingsForm";
import { requireFamily } from "@/lib/auth/current-family";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("name, default_serves, day_start_time")
    .eq("id", familyId)
    .maybeSingle();
  if (familyError) throw new Error(`Could not load your settings: ${familyError.message}`);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-400 mt-0.5">Family preferences</p>
      </div>
      <FamilySettingsForm
        familyId={familyId}
        defaultServes={family?.default_serves ?? 4}
        dayStartTime={family?.day_start_time ?? "07:00:00"}
      />
    </div>
  );
}
