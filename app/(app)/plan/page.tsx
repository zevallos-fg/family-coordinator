import Link from "next/link";
import { CalendarDays, ChevronRight, Inbox, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireFamily } from "@/lib/auth/current-family";
import { AddEvent } from "@/components/plan/AddEvent";
import { EventRow, type EventSummary } from "@/components/plan/EventRow";

export const dynamic = "force-dynamic";

/**
 * Plan: what's booked, and getting ready for it.
 *
 * Each event carries its own prep — questions to ask, things to bring — and,
 * afterwards, what was decided. To-dos and the capture inbox are one tap away
 * rather than repeated here.
 */
export default async function PlanPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();
  const since = new Date(new Date().getTime() - 6 * 3600 * 1000).toISOString();
  const { data: fam } = await supabase.from("families").select("timezone").eq("id", familyId).maybeSingle();
  // supabase-error-ignored: without a stored zone, the family's usual one.
  const tz = fam?.timezone ?? "America/New_York";

  const [upRes, pastRes, kidsRes, itemsRes, openRes, inboxRes] = await Promise.all([
    supabase
      .from("family_events")
      .select("id, title, kind, starts_at, location, with_whom, status, kid_id")
      .eq("family_id", familyId)
      .eq("status", "planned")
      .gte("starts_at", since)
      .order("starts_at", { ascending: true }),
    supabase
      .from("family_events")
      .select("id, title, kind, starts_at, location, with_whom, status, kid_id")
      .eq("family_id", familyId)
      .or(`status.neq.planned,starts_at.lt.${since}`)
      .order("starts_at", { ascending: false })
      .limit(10),
    supabase.from("kids").select("id, name, birth_date").eq("family_id", familyId).order("birth_date", { ascending: false }),
    supabase.from("event_items").select("event_id, kind, done").eq("family_id", familyId),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .in("status", ["open", "in_progress"]),
    supabase
      .from("captures")
      .select("id", { count: "exact", head: true })
      .eq("family_id", familyId)
      .is("completed_at", null),
  ]);

  const failed = [upRes, pastRes, kidsRes, itemsRes].some((r) => r.error);
  const kids = kidsRes.data ?? [];
  const kidName = new Map(kids.map((k) => [k.id, k.name]));
  const progress = new Map<string, { done: number; total: number }>();
  for (const i of itemsRes.data ?? []) {
    if (i.kind === "decision") continue;
    const p = progress.get(i.event_id) ?? { done: 0, total: 0 };
    p.total++;
    if (i.done) p.done++;
    progress.set(i.event_id, p);
  }
  const summarize = (e: NonNullable<typeof upRes.data>[number]): EventSummary => ({
    ...e,
    kid: e.kid_id ? (kidName.get(e.kid_id) ?? null) : null,
    progress: progress.get(e.id) ?? null,
  });
  const upcoming = (upRes.data ?? []).map(summarize);
  const past = (pastRes.data ?? []).map(summarize);

  return (
    <div className="mx-auto max-w-md space-y-5 pb-4" data-testid="plan">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-medium text-stone-800">
          <CalendarDays className="h-5 w-5 text-violet-600" aria-hidden /> Plan
        </h1>
      </header>

      {failed && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Some of this didn&apos;t load. Reload to try again.</p>
      )}

      <AddEvent familyId={familyId} kids={kids} />

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
            Nothing booked yet. Add a checkup, a school meeting, anything with a date.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <EventRow key={e.id} event={e} timeZone={tz} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Link href="/now" className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700">
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-amber-600" aria-hidden /> To-dos
          </span>
          <span className="text-xs text-stone-500">{openRes.count ?? 0}</span>
        </Link>
        <Link href="/capture" className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700">
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-violet-600" aria-hidden /> Notes inbox
          </span>
          <span className="text-xs text-stone-500">{inboxRes.count ?? 0}</span>
        </Link>
      </section>

      {past.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs uppercase tracking-wide text-stone-400">
            <ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" aria-hidden /> Past ({past.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {past.map((e) => (
              <EventRow key={e.id} event={e} timeZone={tz} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
