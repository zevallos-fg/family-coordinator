import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CaregiverForm } from "@/components/caregiver/CaregiverForm";
import { createCaregiver } from "@/app/(app)/caregiver/actions";

export default async function NewCaregiverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div>
        <Link href="/caregiver/caregivers" className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Caregivers
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Add caregiver</h1>
      </div>
      <CaregiverForm action={createCaregiver} submitLabel="Add caregiver" />
    </main>
  );
}
