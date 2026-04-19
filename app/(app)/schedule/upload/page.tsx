import Link from "next/link";
import { UploadForm } from "@/components/schedule/UploadForm";
import { parseWeekParam, formatWeekParam } from "@/lib/week";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function ScheduleUploadPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;
  const today = new Date();
  const selectedWeek = parseWeekParam(weekParam ?? null, today);
  const weekStr = formatWeekParam(selectedWeek);

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/schedule?week=${weekStr}`}
          className="text-sm text-stone-400 hover:text-stone-600"
        >
          ← Schedule
        </Link>
        <h1 className="text-xl font-semibold text-stone-800">Upload calendar</h1>
      </div>

      <p className="text-sm text-stone-500">
        Upload a screenshot of your shared family calendar. Claude will extract events
        and assign Leo&apos;s care duties for each day. Red-colored events are ignored.
      </p>

      <UploadForm weekOf={weekStr} />
    </div>
  );
}
