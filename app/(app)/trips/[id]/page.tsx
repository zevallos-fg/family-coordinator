import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { TripPackingList } from "@/components/trips/TripPackingList";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTrip(id: string) {
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

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("*")
    .eq("id", id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  if (tripError || !trip) return { trip: null, items: [], error: tripError?.message };

  const { data: items } = await supabase
    .from("trip_packing_items")
    .select("id, item, notes, packed")
    .eq("trip_id", id)
    .order("item");

  return { trip, items: items ?? [], error: null };
}

export default async function TripDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { trip, items, error } = await getTrip(id);

  if (!trip && !error) notFound();

  const packed = items.filter((i) => i.packed).length;
  const pct = items.length > 0 ? Math.round((packed / items.length) * 100) : 0;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/trips" className="text-sm text-stone-400 hover:text-stone-600">
          ← Trips
        </Link>
        {trip && (
          <>
            <h1 className="text-2xl font-bold text-stone-800 mt-2">{trip.destination}</h1>
            <p className="text-sm text-stone-400">
              {new Date(trip.start_date).toLocaleDateString()} —{" "}
              {new Date(trip.end_date).toLocaleDateString()}
            </p>
          </>
        )}
      </div>

      {error && <ErrorBanner userMessage="Could not load trip details." />}

      {trip && items.length > 0 && (
        <div className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-stone-700">Packing Progress</span>
            <span className="text-sm text-stone-500">
              {packed}/{items.length} packed ({pct}%)
            </span>
          </div>
          <div className="w-full h-2 bg-stone-200 rounded-full">
            <div
              className="h-2 bg-amber-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {trip && items.length === 0 && (
        <EmptyState
          title="No packing items yet"
          description="Items are generated automatically when you create a trip."
        />
      )}

      {trip && items.length > 0 && (
        <TripPackingList tripId={id} items={items} />
      )}
    </main>
  );
}
