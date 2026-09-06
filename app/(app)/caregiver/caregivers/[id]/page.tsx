import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CaregiverForm } from "@/components/caregiver/CaregiverForm";
import { updateCaregiver } from "@/app/(app)/caregiver/actions";
import { requireFamily } from "@/lib/auth/current-family";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCaregiverPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: caregiver } = await supabase
    .from("caregivers")
    .select("*")
    .eq("id", id)
    .eq("family_id", familyId)
    .single();

  if (!caregiver) notFound();

  const action = updateCaregiver.bind(null, id);

  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div>
        <Link href="/caregiver/caregivers" className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Caregivers
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Edit {caregiver.name}</h1>
      </div>
      <CaregiverForm
        action={action}
        defaultValues={{
          name: caregiver.name,
          role: caregiver.role,
          email: caregiver.email ?? undefined,
          phone: caregiver.phone ?? undefined,
          notes: caregiver.notes ?? undefined,
        }}
        submitLabel="Save changes"
      />
    </main>
  );
}
