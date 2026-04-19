"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, clampWeek, defaultPlanWeek, formatWeekRange, formatWeekParam } from "@/lib/week";

export interface WeekPickerProps {
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  minWeeksBack?: number;
  maxWeeksForward?: number;
  showTodayButton?: boolean;
}

export function WeekPicker({
  weekStart,
  onWeekChange,
  minWeeksBack = 4,
  maxWeeksForward = 8,
  showTodayButton = true,
}: WeekPickerProps) {
  const today = new Date();
  const defaultWeek = defaultPlanWeek(today);

  const minWeek = addDays(defaultWeek, -minWeeksBack * 7);
  const maxWeek = addDays(defaultWeek, maxWeeksForward * 7);

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);

  const atMin = weekStart.getTime() <= minWeek.getTime();
  const atMax = weekStart.getTime() >= maxWeek.getTime();
  const onDefaultWeek = formatWeekParam(weekStart) === formatWeekParam(defaultWeek);

  function goToToday() {
    onWeekChange(clampWeek(defaultWeek, today, maxWeeksForward));
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={() => onWeekChange(prevWeek)}
        disabled={atMin}
        aria-label="Previous week"
        className="flex items-center justify-center w-8 h-8 rounded-md border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} />
      </button>

      <span className="flex-1 text-center text-sm font-medium text-stone-700 min-w-0 px-1 sm:px-2 whitespace-nowrap">
        Week of {formatWeekRange(weekStart)}
      </span>

      {showTodayButton && (
        <button
          type="button"
          onClick={goToToday}
          disabled={onDefaultWeek}
          aria-label="Jump to default week"
          className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Today
        </button>
      )}

      <button
        type="button"
        onClick={() => onWeekChange(nextWeek)}
        disabled={atMax}
        aria-label="Next week"
        className="flex items-center justify-center w-8 h-8 rounded-md border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
