import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { DigestView } from "@/components/digest/DigestView";

async function getDigests() {
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

  const { data: digests, error } = await supabase
    .from("digests")
    .select("id, week_start_date, content, blind_spots, sent_at, created_at")
    .eq("family_id", membership.family_id)
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
