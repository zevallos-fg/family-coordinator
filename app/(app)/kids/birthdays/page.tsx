import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { BirthdayEventsView } from "@/components/kids/BirthdayEventsView";
import { requireFamily } from "@/lib/auth/current-family";

async function getBirthdayEvents() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: events, error } = await supabase
    .from("kid_birthday_events")
    .select("*, kids(name, birth_date)")
    .eq("family_id", familyId)
    .order("party_date", { ascending: true });

  const { data: kids } = await supabase
    .from("kids")
    .select("id, name")
    .eq("family_id", familyId);

  return {
    events: events ?? [],
    kids: kids ?? [],
    error: error?.message ?? null,
  };
}

export default async function BirthdayEventsPage() {
  const { events, kids, error } = await getBirthdayEvents();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Birthday Parties</h1>
          <p className="text-sm text-stone-400 mt-1">Hosting and attending — with gift suggestions.</p>
        </div>
        <a href="/kids" className="text-sm text-stone-400 hover:text-stone-600">← Kids</a>
      </div>

      {error && <ErrorBanner userMessage="Could not load birthday events." />}

      {!error && events.length === 0 && (
        <EmptyState
          title="No birthday events yet"
          description="Add parties your family is hosting or attending."
          action={<BirthdayEventsView events={[]} kids={kids} showAddButton />}
        />
      )}

      {!error && events.length > 0 && (
        <BirthdayEventsView events={events} kids={kids} showAddButton />
      )}
    </main>
  );
}
