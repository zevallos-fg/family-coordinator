import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Greeting } from "@/components/dashboard/Greeting";
import { TodayDate } from "@/components/dashboard/TodayDate";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, role, families(name, timezone)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const familyId = membership.family_id;
  const familyName = (membership.families as { name: string } | null)?.name ?? "your household";
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: todayDuties },
    { data: unresolvedCaptures },
    { data: pendingGrocery },
    { data: userData },
    { count: groceryTotal },
  ] = await Promise.all([
    supabase
      .from("schedule_entries")
      .select("id, duty_type, notes")
      .eq("family_id", familyId)
      .eq("date", today),
    supabase
      .from("captures")
      .select("id, text, created_at, categories(name, icon)")
      .eq("family_id", familyId)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("grocery_items")
      .select("id, name, quantity")
      .eq("family_id", familyId)
      .eq("in_cart", false)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("grocery_items")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .eq("in_cart", false)
      .is("completed_at", null),
  ]);

  const firstName = userData?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-6">
      {/* Header — client components avoid SSR/client time mismatch (hydration #418) */}
      <div>
        <Greeting name={firstName} />
        <TodayDate familyName={familyName} />
      </div>

      {/* Today's schedule */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-stone-700">Today&apos;s duties</h2>
          <Link href="/schedule" className="text-xs text-amber-600 hover:text-amber-700">
            Plan next week →
          </Link>
        </div>
        {todayDuties && todayDuties.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {todayDuties.map((duty) => (
              <div key={duty.id} className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-stone-500 capitalize">{duty.duty_type}</p>
                <p className="text-sm font-medium text-stone-800 mt-0.5">
                  {duty.notes ?? "—"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-stone-400">
            <p className="text-sm">No duties set for today</p>
            <Link href="/schedule/upload" className="text-xs text-amber-600 mt-1 block hover:underline">
              Upload calendar →
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Unresolved captures */}
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-stone-700">
              Pending{" "}
              {unresolvedCaptures && unresolvedCaptures.length > 0 && (
                <span className="ml-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                  {unresolvedCaptures.length}
                </span>
              )}
            </h2>
            <Link href="/organized" className="text-xs text-amber-600 hover:text-amber-700">
              Organized →
            </Link>
          </div>
          {unresolvedCaptures && unresolvedCaptures.length > 0 ? (
            <ul className="space-y-2">
              {unresolvedCaptures.map((c) => {
                const cat = c.categories as { name: string; icon: string | null } | null;
                return (
                  <li key={c.id} className="flex items-start gap-2">
                    {cat?.icon && (
                      <span className="text-sm shrink-0 mt-0.5">{cat.icon}</span>
                    )}
                    <p className="text-sm text-stone-700 line-clamp-1">{c.text}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-3 text-center">
              <p className="text-sm text-stone-400">All clear!</p>
              <Link href="/capture/new" className="text-xs text-amber-600 hover:text-amber-700 mt-1 block">
                + Capture →
              </Link>
            </div>
          )}
        </div>

        {/* Grocery needed */}
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-stone-700">
              Grocery list{" "}
              {(groceryTotal ?? 0) > 0 && (
                <span className="ml-1 bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded-full">
                  {groceryTotal}
                </span>
              )}
            </h2>
            <Link href="/grocery" className="text-xs text-amber-600 hover:text-amber-700">
              Full list →
            </Link>
          </div>
          {pendingGrocery && pendingGrocery.length > 0 ? (
            <ul className="space-y-1.5">
              {pendingGrocery.map((item) => (
                <li key={item.id} className="text-sm text-stone-700 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {item.name}
                  {item.quantity && (
                    <span className="text-xs text-stone-400">({item.quantity})</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-400 py-3 text-center">List is empty</p>
          )}
        </div>
      </div>

      {/* Quick capture */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="font-medium text-stone-700 mb-3">Quick capture</h2>
        <Link
          href="/capture/new"
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border-2 border-dashed border-stone-200 text-stone-400 hover:border-amber-300 hover:text-amber-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm">What&apos;s on your mind?</span>
        </Link>
      </div>
    </div>
  );
}
