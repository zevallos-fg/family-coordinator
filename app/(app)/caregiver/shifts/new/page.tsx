import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShiftForm } from "@/components/caregiver/ShiftForm";

export default async function NewShiftPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const [{ data: caregivers }, { data: kids }] = await Promise.all([
    supabase
      .from("caregivers")
      .select("id, name, role")
      .eq("family_id", membership.family_id)
      .order("created_at"),
    supabase
      .from("kids")
      .select("id, name")
      .eq("family_id", membership.family_id)
      .order("created_at"),
  ]);

  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div>
        <Link href="/caregiver/shifts" className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Shifts
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New shift</h1>
      </div>
      <ShiftForm
        caregivers={caregivers ?? []}
        kids={(kids ?? []).map((k) => ({ id: k.id, name: k.name }))}
      />
    </main>
  );
}
