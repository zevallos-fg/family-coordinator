import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import Link from "next/link";

async function getKids() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { data: kids, error } = await supabase
    .from("kids")
    .select(`
      id, name, birth_date, notes,
      kid_milestones(id, milestone_type, logged_at, notes)
    `)
    .eq("family_id", membership.family_id)
    .order("name");

  return { kids: kids ?? [], error: error?.message ?? null };
}

function getAgeLabel(birth_date: string | null): string {
  if (!birth_date) return "Age unknown";
  const months = Math.floor(
    (new Date().getTime() - new Date(birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

export default async function KidsPage() {
  const { kids, error } = await getKids();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Kids</h1>
        <p className="text-sm text-stone-400 mt-1">Milestones and medical records.</p>
      </div>

      {error && <ErrorBanner userMessage="Could not load kids." />}

      {!error && kids.length === 0 && (
        <EmptyState
          title="No kids in your family yet"
          description="Kids are added through the family settings."
        />
      )}

      {!error && kids.length > 0 && (
        <div className="space-y-4">
          {kids.map((kid) => {
            const milestones = (kid.kid_milestones as Array<{
              id: string; milestone_type: string; logged_at: string; notes: string | null
            }>) ?? [];
            const latestMilestone = milestones[0];

            return (
              <div key={kid.id} className="p-4 border border-stone-200 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-800">{kid.name}</h2>
                    <p className="text-sm text-stone-400">{getAgeLabel(kid.birth_date)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/kids/${kid.id}/milestones`}
                      className="text-sm text-amber-700 hover:underline"
                    >
                      Milestones ({milestones.length})
                    </Link>
                    <Link
                      href={`/kids/${kid.id}/medical`}
                      className="text-sm text-stone-500 hover:underline"
                    >
                      Medical
                    </Link>
                  </div>
                </div>
                {latestMilestone && (
                  <p className="text-xs text-stone-400">
                    Latest: {latestMilestone.milestone_type} —{" "}
                    {new Date(latestMilestone.logged_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
