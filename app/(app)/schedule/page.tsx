import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekView } from "@/components/schedule/WeekView";
import { WeekPickerNav } from "@/components/ui/WeekPickerNav";
import { parseWeekParam, formatWeekParam, addDays } from "@/lib/week";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function SchedulePage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;

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

  const today = new Date();
  const selectedWeek = parseWeekParam(weekParam ?? null, today);
  const weekStr = formatWeekParam(selectedWeek);

  if (!weekParam) {
    redirect(`/schedule?week=${weekStr}`);
  }

  // Fetch Mon–Sun for selected week
  const weekEnd = formatWeekParam(addDays(selectedWeek, 6));

  const { data: duties } = await supabase
    .from("schedule_entries")
    .select("id, date, duty_type, notes")
    .eq("family_id", membership.family_id)
    .gte("date", weekStr)
    .lte("date", weekEnd)
    .order("date", { ascending: true });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Schedule</h1>
          <p className="text-sm text-stone-400 mt-0.5">Leo&apos;s care duties by week</p>
        </div>
        <Link
          href={`/schedule/upload?week=${weekStr}`}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          Upload calendar
        </Link>
      </div>

      {/* Week picker */}
      <div className="bg-white rounded-xl border border-stone-200 px-4 py-3">
        <WeekPickerNav maxWeeksForward={8} minWeeksBack={4} />
      </div>

      <WeekView duties={duties ?? []} />
    </div>
  );
}
