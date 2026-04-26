import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MilestoneLogger } from "@/components/kids/MilestoneLogger";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getKidMilestones(kid_id: string) {
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

  const { data: kid } = await supabase
    .from("kids")
    .select("id, name, birth_date")
    .eq("id", kid_id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  if (!kid) return { kid: null, milestones: [], error: null };

  const { data: milestones, error } = await supabase
    .from("kid_milestones")
    .select("id, milestone_type, logged_at, notes")
    .eq("kid_id", kid_id)
    .order("logged_at", { ascending: false });

  return { kid, milestones: milestones ?? [], error: error?.message ?? null };
}

const MILESTONE_TYPE_LABELS: Record<string, string> = {
  motor_gross: "Gross Motor",
  motor_fine: "Fine Motor",
  language_speech: "Language & Speech",
  cognitive: "Cognitive",
  social_emotional: "Social & Emotional",
  self_care: "Self-Care",
  physical_growth: "Physical Growth",
  creative: "Creative",
  general: "General",
};

export default async function KidMilestonesPage({ params }: PageProps) {
  const { id } = await params;
  const { kid, milestones, error } = await getKidMilestones(id);

  if (!kid) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/kids" className="text-sm text-stone-400 hover:text-stone-600">
          ← Kids
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-stone-800">{kid.name} — Milestones</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/kids/${id}/milestones`} className="text-sm text-amber-700 font-medium">Milestones</Link>
            <Link href={`/kids/${id}/medical`} className="text-sm text-stone-400 hover:text-stone-600">Medical</Link>
          </div>
        </div>
      </div>

      {error && <ErrorBanner userMessage="Could not load milestones." />}

      {/* Log milestone */}
      <MilestoneLogger kidId={id} />

      {/* Timeline */}
      {milestones.length === 0 && (
        <EmptyState
          title="No milestones logged yet"
          description="Use the form above to log Leo's first milestone."
        />
      )}

      {milestones.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">Timeline</h2>
          {milestones.map((m) => {
            const isFollowup = m.notes?.includes("[FOLLOWUP]");
            return (
              <div
                key={m.id}
                className={`p-3 border rounded-lg ${
                  isFollowup ? "border-yellow-200 bg-yellow-50" : "border-stone-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-stone-500 uppercase">
                    {MILESTONE_TYPE_LABELS[m.milestone_type] ?? m.milestone_type}
                  </span>
                  <span className="text-xs text-stone-400">
                    {new Date(m.logged_at).toLocaleDateString()}
                  </span>
                </div>
                {m.notes && (
                  <p className="text-sm text-stone-700">{m.notes.replace(" [FOLLOWUP]", "")}</p>
                )}
                {isFollowup && (
                  <p className="text-xs text-yellow-700 mt-1 font-medium">
                    Discuss with pediatrician at next visit
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
