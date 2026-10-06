import Link from "next/link";
import { CalendarDays, ListChecks, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireFamily } from "@/lib/auth/current-family";
import { KidsCard } from "@/components/home/KidsCard";
import { CareCard } from "@/components/home/CareCard";
import { HomeHeader } from "@/components/home/HomeHeader";
import { CaptureBar } from "@/components/home/CaptureBar";

export const dynamic = "force-dynamic";

type DueRow = { source_id: string; source_table: string; item: string; due_on: string; bucket: string };

/** "Thu" for a date this week, "Oct 30" further out. */
function dayLabel(isoDate: string, bucket: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return bucket === "this_week"
    ? date.toLocaleDateString("en-US", { weekday: "short" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Home: four rooms and one way in.
 *
 *   Kids   — live, client-side (timers tick; see KidsCard)
 *   Today  — what is due today or overdue, plus undated to-dos
 *   Food   — tonight's dinner and the shopping list by store
 *   Plan   — the rest of the week, then what is next beyond it
 *
 * The capture bar at the bottom is the mind dump: it feeds all four. Every card
 * opens the full screen it summarises, so this page never grows its own copy of
 * a list.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: fam } = await supabase.from("families").select("timezone").eq("id", familyId).maybeSingle();
  // supabase-error-ignored: a missing timezone falls back to the family's usual one.
  const tz = fam?.timezone ?? "America/New_York";
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const weekAhead = new Date(new Date().getTime() + 7 * 86_400_000).toISOString();
  const [dueRes, anytimeRes, groceryRes, mealRes, inboxRes, eventsRes] = await Promise.all([
    supabase
      .from("v_whats_due")
      .select("source_id, source_table, item, due_on, bucket")
      .eq("family_id", familyId)
      .order("due_on", { ascending: true }),
    supabase
      .from("tasks")
      .select("id, title")
      .eq("family_id", familyId)
      .in("status", ["open", "in_progress"])
      .is("due_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("grocery_items").select("id, stores(name)").eq("family_id", familyId).is("completed_at", null),
    supabase
      .from("meal_plan_entries")
      .select("meal_type, notes, recipes(name), meal_plans!inner(family_id)")
      .eq("meal_plans.family_id", familyId)
      .eq("date", todayLocal),
    supabase
      .from("captures")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .is("completed_at", null),
    supabase
      .from("family_events")
      .select("id, title, starts_at, kids(name)")
      .eq("family_id", familyId)
      .eq("status", "planned")
      .gte("starts_at", new Date(new Date().getTime() - 2 * 3600_000).toISOString())
      .lt("starts_at", weekAhead)
      .order("starts_at"),
  ]);

  const failed = [dueRes, anytimeRes, groceryRes, mealRes, eventsRes].some((r) => r.error);
  const due = (dueRes.data ?? []) as unknown as DueRow[];
  const todayRows = due.filter((d) => d.bucket === "today");
  const overdue = due.filter((d) => d.bucket === "overdue");
  const anytime = anytimeRes.data ?? [];
  const todayList = [...todayRows.map((d) => d.item), ...overdue.map((d) => d.item), ...anytime.map((t) => t.title)];
  // Booked events first (they have a time), then dated to-dos this week and beyond.
  const booked = ((eventsRes.data ?? []) as unknown as Array<{ id: string; title: string; starts_at: string; kids: { name: string } | null }>).map(
    (e) => ({
      key: `event-${e.id}`,
      href: `/plan/${e.id}`,
      label: `${new Date(e.starts_at).toLocaleDateString("en-US", { weekday: "short", timeZone: tz })} ${new Date(e.starts_at)
        .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
        .toLowerCase()} · ${e.kids?.name ? `${e.kids.name} ` : ""}${e.title}`,
    })
  );
  const planRows = [
    ...booked,
    ...[...due.filter((d) => d.bucket === "this_week"), ...due.filter((d) => d.bucket === "ahead")].map((r) => ({
      key: `${r.source_table}-${r.source_id}`,
      href: "/now",
      label: `${dayLabel(r.due_on, r.bucket)} · ${r.item}`,
    })),
  ].slice(0, 3);

  const byStore = new Map<string, number>();
  for (const g of groceryRes.data ?? []) {
    const store = (g as unknown as { stores: { name: string } | null }).stores?.name ?? "No store";
    byStore.set(store, (byStore.get(store) ?? 0) + 1);
  }
  const buyTotal = groceryRes.data?.length ?? 0;
  const topStore = [...byStore.entries()].filter(([n]) => n !== "No store").sort((a, b) => b[1] - a[1])[0];

  const meals = (mealRes.data ?? []) as unknown as Array<{ meal_type: string; notes: string | null; recipes: { name: string } | null }>;
  const dinner = meals.find((m) => m.meal_type === "dinner") ?? meals[0];
  const dinnerName = dinner ? (dinner.recipes?.name ?? dinner.notes ?? null) : null;

  const dueLine =
    todayRows.length > 0
      ? `${todayRows.length} due today${overdue.length ? ` · ${overdue.length} overdue` : ""}`
      : overdue.length
        ? `${overdue.length} overdue`
        : "nothing due today";

  return (
    <div className="mx-auto max-w-md pb-4" data-testid="home">
      <HomeHeader familyId={familyId} dueLine={dueLine} />

      {failed && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Some of this didn&apos;t load. Pull to refresh.
        </p>
      )}

      <div className="space-y-2.5">
        <KidsCard familyId={familyId} />
        <CareCard familyId={familyId} />

        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/now" className="rounded-2xl border border-stone-200 bg-white p-3" data-testid="home-today">
            <span className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-600">
              <ListChecks className="h-4 w-4" aria-hidden /> Today
            </span>
            {todayList.length === 0 ? (
              <span className="block text-xs text-stone-500">Nothing due</span>
            ) : (
              <>
                {todayList.slice(0, 2).map((t, i) => (
                  <span key={i} className="block truncate text-xs text-stone-800">
                    {t}
                  </span>
                ))}
                {(todayList.length > 2 || overdue.length > 0) && (
                  <span className="block text-xs text-stone-500">
                    {[todayList.length > 2 && `+${todayList.length - 2} more`, overdue.length > 0 && `${overdue.length} overdue`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </>
            )}
          </Link>

          <div className="rounded-2xl border border-stone-200 bg-white p-3" data-testid="home-food">
            <Link href="/meal-plans" className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-600">
              <UtensilsCrossed className="h-4 w-4" aria-hidden /> Food
            </Link>
            <Link href="/meal-plans" className="block truncate text-xs text-stone-800">
              {dinnerName ? `Tonight: ${dinnerName}` : "Nothing planned tonight"}
            </Link>
            <Link href="/grocery" className="block text-xs text-stone-500">
              Buy {buyTotal}
              {topStore ? ` · ${topStore[0]} ${topStore[1]}` : ""}
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-3" data-testid="home-plan">
          <Link href="/plan" className="mb-1.5 flex items-center gap-1.5 font-medium text-violet-600">
            <CalendarDays className="h-4 w-4" aria-hidden /> Plan · this week
          </Link>
          {planRows.length === 0 ? (
            <Link href="/plan" className="block text-xs text-stone-500">
              Nothing scheduled ahead — add an event
            </Link>
          ) : (
            planRows.map((r) => (
              <Link key={r.key} href={r.href} className="block truncate text-xs text-stone-800">
                {r.label}
              </Link>
            ))
          )}
        </div>

        <CaptureBar inboxCount={inboxRes.count ?? 0} />
      </div>
    </div>
  );
}
