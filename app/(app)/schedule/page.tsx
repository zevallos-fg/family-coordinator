import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WeekView } from "@/components/schedule/WeekView";
import { WeekPickerNav } from "@/components/ui/WeekPickerNav";
import { parseWeekParam, formatWeekParam, addDays, weekLabel } from "@/lib/week";
import { requireFamily } from "@/lib/auth/current-family";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function SchedulePage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;

  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const today = new Date();
  const selectedWeek = parseWeekParam(weekParam ?? null, today);
  const weekStr = formatWeekParam(selectedWeek);

  if (!weekParam) {
    redirect(`/schedule?week=${weekStr}`);
  }

  // Fetch Mon–Sun for selected week
  const weekEnd = formatWeekParam(addDays(selectedWeek, 6));

  // Whose duties these are, from the family rather than from a hardcoded name.
  const { data: kids } = await supabase
    .from("kids")
    .select("name")
    .eq("family_id", familyId)
    .order("name");

  const { data: duties } = await supabase
    .from("schedule_entries")
    .select("id, date, duty_type, notes")
    .eq("family_id", familyId)
    .gte("date", weekStr)
    .lte("date", weekEnd)
    .order("date", { ascending: true });

  // One kid gets named; nought or several get a subtitle that is true for both.
  const names = (kids ?? []).map((k) => k.name);
  const subtitle =
    names.length === 1
      ? `${names[0]}'s care duties by week`
      : "Care duties by week";
  const shownWeek = weekLabel(selectedWeek, today);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Schedule</h1>
          <p className="text-sm text-stone-400 mt-0.5">{subtitle}</p>
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

      <WeekView duties={duties ?? []} weekLabel={shownWeek} />
    </div>
  );
}
