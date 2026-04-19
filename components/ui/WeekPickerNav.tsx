"use client";

import { useWeekParam } from "@/hooks/use-week-param";
import { WeekPicker } from "@/components/ui/WeekPicker";

interface WeekPickerNavProps {
  minWeeksBack?: number;
  maxWeeksForward?: number;
  showTodayButton?: boolean;
}

// Server-page bridge: reads ?week from URL, renders WeekPicker, writes navigation via router.push.
// Usage: <WeekPickerNav /> inside a server component — no props required.
export function WeekPickerNav({
  minWeeksBack = 4,
  maxWeeksForward = 8,
  showTodayButton = true,
}: WeekPickerNavProps) {
  const { selectedWeek, setWeek } = useWeekParam();
  return (
    <WeekPicker
      weekStart={selectedWeek}
      onWeekChange={setWeek}
      minWeeksBack={minWeeksBack}
      maxWeeksForward={maxWeeksForward}
      showTodayButton={showTodayButton}
    />
  );
}
