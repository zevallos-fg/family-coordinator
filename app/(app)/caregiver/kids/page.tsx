import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { KidProfile } from "@/components/kid-state/KidProfile";

export default async function KidsPage() {
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

  const { data: kids } = await supabase
    .from("kids")
    .select("id, name, birth_date, notes, food_favorites, food_aversions, clothing_size, shoe_size")
    .eq("family_id", membership.family_id)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/caregiver" className="text-sm text-foreground/40 hover:text-foreground/60">
            ← Caregiver Hub
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Kids</h1>
        </div>
        <Link href="/caregiver/kids/new">
          <Button>Add child</Button>
        </Link>
      </div>

      {(kids ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/20 p-8 text-center">
          <p className="text-foreground/50 text-sm">No kids yet.</p>
          <Link href="/caregiver/kids/new">
            <Button className="mt-3">
              Add your first child
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {(kids ?? []).map((k) => (
            <div key={k.id} className="rounded-lg border border-foreground/10 p-5">
              <KidProfile kid={k} />
              <div className="mt-4 flex gap-2">
                <Link href={`/caregiver/kids/${k.id}`}>
                  <Button variant="outline">
                    Edit profile
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
