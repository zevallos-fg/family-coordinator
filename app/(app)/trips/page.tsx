import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import Link from "next/link";

async function getTrips() {
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

  const { data: trips, error } = await supabase
    .from("trips")
    .select(`
      id, destination, start_date, end_date, notes,
      trip_packing_items(id, packed)
    `)
    .eq("family_id", membership.family_id)
    .order("start_date", { ascending: false });

  return { trips: trips ?? [], error: error?.message ?? null };
}

function packedPercent(items: Array<{ packed: boolean }>) {
  if (items.length === 0) return null;
  const packed = items.filter((i) => i.packed).length;
  return Math.round((packed / items.length) * 100);
}

export default async function TripsPage() {
  const { trips, error } = await getTrips();

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Trips</h1>
          <p className="text-sm text-stone-400 mt-1">Plan trips with AI-generated packing lists.</p>
        </div>
        <Link
          href="/trips/new"
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          + Plan trip
        </Link>
      </div>

      {error && <ErrorBanner userMessage="Could not load trips. Please refresh." />}

      {!error && trips.length === 0 && (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
            </svg>
          }
          title="No trips planned"
          description="Plan a trip and get an AI-generated packing list with prep tasks."
          action={
            <Link
              href="/trips/new"
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              Plan your first trip
            </Link>
          }
        />
      )}

      {!error && trips.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left">
                <th className="pb-2 font-medium text-stone-500">Destination</th>
                <th className="pb-2 font-medium text-stone-500">Dates</th>
                <th className="pb-2 font-medium text-stone-500">Packed</th>
                <th className="pb-2 font-medium text-stone-500"></th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => {
                const pct = packedPercent(
                  (trip.trip_packing_items as Array<{ id: string; packed: boolean }>) ?? []
                );
                return (
                  <tr key={trip.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-3 font-medium text-stone-800">
                      <Link href={`/trips/${trip.id}`} className="hover:text-amber-700">
                        {trip.destination}
                      </Link>
                    </td>
                    <td className="py-3 text-stone-500 text-xs">
                      {new Date(trip.start_date).toLocaleDateString()} —{" "}
                      {new Date(trip.end_date).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      {pct === null ? (
                        <span className="text-xs text-stone-400">No items</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-stone-200 rounded-full">
                            <div
                              className="h-1.5 bg-amber-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-stone-500">{pct}%</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/trips/${trip.id}`}
                        className="text-xs text-amber-700 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
