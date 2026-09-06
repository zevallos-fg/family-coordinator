import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CaregiverList } from "@/components/caregiver/CaregiverList";
import { requireFamily } from "@/lib/auth/current-family";

export default async function CaregiversPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: caregivers } = await supabase
    .from("caregivers")
    .select("id, name, role, email, phone, notes")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/caregiver" className="text-sm text-foreground/40 hover:text-foreground/60">
            ← Caregiver Hub
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Caregivers</h1>
        </div>
        <Link href="/caregiver/caregivers/new">
          <Button>Add caregiver</Button>
        </Link>
      </div>

      <CaregiverList caregivers={caregivers ?? []} />
    </main>
  );
}
