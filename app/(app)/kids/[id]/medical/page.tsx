import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MedicalEventForm } from "@/components/kids/MedicalEventForm";
import Link from "next/link";
import { MEDICAL_EVENT_TYPE_LABEL, type MedicalEventType } from "@/lib/db/enums";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getKidMedical(kid_id: string) {
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
    .select("id, name")
    .eq("id", kid_id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  if (!kid) return { kid: null, events: [], error: null };

  const { data: events, error } = await supabase
    .from("medical_events")
    .select("id, event_date, event_type, provider, notes")
    .eq("kid_id", kid_id)
    .order("event_date", { ascending: false });

  return { kid, events: events ?? [], error: error?.message ?? null };
}

export default async function KidMedicalPage({ params }: PageProps) {
  const { id } = await params;
  const { kid, events, error } = await getKidMedical(id);

  if (!kid) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/kids" className="text-sm text-stone-400 hover:text-stone-600">
          ← Kids
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-bold text-stone-800">{kid.name} — Medical</h1>
          <div className="flex gap-2">
            <Link href={`/kids/${id}/milestones`} className="text-sm text-stone-400 hover:text-stone-600">Milestones</Link>
            <Link href={`/kids/${id}/medical`} className="text-sm text-amber-700 font-medium">Medical</Link>
          </div>
        </div>
        <p className="text-xs text-stone-400 mt-1">Simple records only — no AI on this page.</p>
      </div>

      {error && <ErrorBanner userMessage="Could not load medical records." />}

      {/* Add event form */}
      <MedicalEventForm kidId={id} />

      {/* Records table */}
      {events.length === 0 && (
        <EmptyState
          title="No medical records yet"
          description="Log checkups, vaccinations, and other medical events."
        />
      )}

      {events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left">
                <th className="pb-2 font-medium text-stone-500">Date</th>
                <th className="pb-2 font-medium text-stone-500">Type</th>
                <th className="pb-2 font-medium text-stone-500">Provider</th>
                <th className="pb-2 font-medium text-stone-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-stone-100">
                  <td className="py-2 text-stone-600 text-xs">
                    {new Date(e.event_date).toLocaleDateString()}
                  </td>
                  <td className="py-2 font-medium text-stone-700">{MEDICAL_EVENT_TYPE_LABEL[e.event_type as MedicalEventType] ?? e.event_type}</td>
                  <td className="py-2 text-stone-400 text-xs">{e.provider ?? "—"}</td>
                  <td className="py-2 text-stone-400 text-xs">{e.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
