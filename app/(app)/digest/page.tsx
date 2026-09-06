import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { DigestView } from "@/components/digest/DigestView";
import { requireFamily } from "@/lib/auth/current-family";

async function getDigests() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: digests, error } = await supabase
    .from("digests")
    .select("id, week_start_date, content, blind_spots, sent_at, created_at")
    .eq("family_id", familyId)
    .order("week_start_date", { ascending: false })
    .limit(10);

  return { digests: digests ?? [], error: error?.message ?? null };
}

export default async function DigestPage() {
  const { digests, error } = await getDigests();

  const currentWeek = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  })();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Weekly Digest</h1>
        <p className="text-sm text-stone-400 mt-1">Family week-in-review with blind spot detection.</p>
      </div>

      {error && <ErrorBanner userMessage="Could not load digests." />}

      {!error && (
        <DigestView
          digests={digests}
          currentWeek={currentWeek}
        />
      )}

      {!error && digests.length === 0 && (
        <EmptyState
          title="No digests yet"
          description="Generate your first weekly digest to see a summary of family activity."
        />
      )}
    </main>
  );
}
