import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KidForm } from "@/components/kid-state/KidForm";
import { createKid } from "@/app/(app)/caregiver/actions";

export default async function NewKidPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div>
        <Link href="/caregiver/kids" className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Kids
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Add a child</h1>
      </div>
      <KidForm action={createKid} submitLabel="Add child" />
    </main>
  );
}
