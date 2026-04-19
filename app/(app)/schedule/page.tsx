import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekView } from "@/components/schedule/WeekView";

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const { start, end } = getWeekRange();

  const { data: duties } = await supabase
    .from("schedule_entries")
    .select("id, date, duty_type, notes")
    .eq("family_id", membership.family_id)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Schedule</h1>
          <p className="text-sm text-stone-400 mt-0.5">This week&apos;s Leo duties</p>
        </div>
        <Link
          href="/schedule/upload"
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          Upload calendar
        </Link>
      </div>

      <WeekView duties={duties ?? []} />
    </div>
  );
}
