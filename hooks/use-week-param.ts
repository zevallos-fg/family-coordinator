"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { defaultPlanWeek, parseWeekParam, formatWeekParam } from "@/lib/week";

export function useWeekParam(todayOverride?: Date) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("week");
  const today = todayOverride ?? new Date();

  const selectedWeek = parseWeekParam(raw, today);
  const defaultWeek = defaultPlanWeek(today);

  const isDefault = !raw;

  function setWeek(d: Date) {
    router.push(`?week=${formatWeekParam(d)}`);
  }

  return { selectedWeek, setWeek, isDefault };
}
