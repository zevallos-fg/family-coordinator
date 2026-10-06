import { createClient } from "@/lib/supabase/server";
import { requireFamily } from "@/lib/auth/current-family";
import { CarePage } from "@/components/care/CarePage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { familyId, userId } = await requireFamily();
  const [membersRes, profilesRes] = await Promise.all([
    supabase.from("family_members").select("user_id, users(full_name)").eq("family_id", familyId),
    supabase.from("care_profiles").select("person_user_id").eq("family_id", familyId),
  ]);
  if (membersRes.error) throw new Error(`Could not load the family: ${membersRes.error.message}`);
  const people = (membersRes.data ?? []).map((m) => ({
    id: m.user_id as string,
    name: ((m as unknown as { users: { full_name: string | null } | null }).users?.full_name ?? "Someone") as string,
  }));
  // Open on whoever has a care profile (Yenny, after the birth); otherwise yourself.
  const withProfile = new Set((profilesRes.data ?? []).map((p) => p.person_user_id));
  const defaultPersonId = people.find((p) => withProfile.has(p.id))?.id ?? userId;
  return <CarePage familyId={familyId} people={people} defaultPersonId={defaultPersonId} />;
}
