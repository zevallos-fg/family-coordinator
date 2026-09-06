import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KidForm } from "@/components/kid-state/KidForm";
import { KidProfile } from "@/components/kid-state/KidProfile";
import { KidUpdateForm } from "@/components/kid-state/KidUpdateForm";
import { updateKid } from "@/app/(app)/caregiver/actions";
import { requireFamily } from "@/lib/auth/current-family";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditKidPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: kid } = await supabase
    .from("kids")
    .select("*")
    .eq("id", id)
    .eq("family_id", familyId)
    .single();

  if (!kid) notFound();

  const action = updateKid.bind(null, id);

  return (
    <main className="mx-auto max-w-lg p-6 space-y-8">
      <div>
        <Link href="/caregiver/kids" className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Kids
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{kid.name}&apos;s profile</h1>
      </div>

      {/* Current state snapshot */}
      <div className="rounded-lg border border-foreground/10 p-5">
        <KidProfile kid={kid} />
      </div>

      {/* Quick AI update */}
      <div className="space-y-2">
        <h2 className="text-base font-medium">Quick update (AI)</h2>
        <p className="text-sm text-foreground/50">
          Tell us something new and the AI will update the profile automatically.
        </p>
        <KidUpdateForm kidId={kid.id} kidName={kid.name} />
      </div>

      {/* Full form edit */}
      <div className="space-y-3">
        <h2 className="text-base font-medium">Edit manually</h2>
        <KidForm
          action={action}
          defaultValues={{
            name: kid.name,
            birth_date: kid.birth_date ?? undefined,
            notes: kid.notes ?? undefined,
            food_favorites: kid.food_favorites ?? undefined,
            food_aversions: kid.food_aversions ?? undefined,
          }}
          submitLabel="Save changes"
        />
      </div>
    </main>
  );
}
