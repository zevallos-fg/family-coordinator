import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { BirthdayEventsView } from "@/components/kids/BirthdayEventsView";

async function getBirthdayEvents() {
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

  const { data: events, error } = await supabase
    .from("kid_birthday_events")
    .select("*, kids(name, birth_date)")
    .eq("family_id", membership.family_id)
    .order("party_date", { ascending: true });

  const { data: kids } = await supabase
    .from("kids")
    .select("id, name")
    .eq("family_id", membership.family_id);

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
