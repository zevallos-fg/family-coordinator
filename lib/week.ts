// Returns the Monday of the week containing d (local calendar dates).
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result;
}

// Mon–Thu → this Monday (living the week); Fri–Sun → next Monday (planning mode).
export function defaultPlanWeek(today: Date): Date {
  const thisMon = startOfWeek(today);
  const dow = today.getDay(); // 0=Sun … 6=Sat
  const isEarlyWeek = dow >= 1 && dow <= 4; // Mon–Thu
  return isEarlyWeek ? thisMon : addDays(thisMon, 7);
}

// Parse ?week=YYYY-MM-DD; snap any non-Monday to its containing Monday.
// Falls back to defaultPlanWeek(today) when missing or invalid.
export function parseWeekParam(raw: string | null, today: Date): Date {
  if (!raw) return defaultPlanWeek(today);
  // Add noon to avoid UTC-midnight drift for clients east of UTC
  const parsed = new Date(raw + "T12:00:00");
  if (isNaN(parsed.getTime())) return defaultPlanWeek(today);
  return startOfWeek(parsed);
}

// Format as YYYY-MM-DD using local calendar date (stable across timezones for this app).
export function formatWeekParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "Apr 20 — 26" or "Apr 27 — May 3" or "Dec 29 — Jan 4"
export function formatWeekRange(weekStart: Date): string {
  const start = new Date(weekStart);
  start.setHours(12, 0, 0, 0); // normalize to noon to guard against DST edge
  const end = addDays(start, 6);
  const sm = start.toLocaleDateString("en-US", { month: "short" });
  const em = end.toLocaleDateString("en-US", { month: "short" });
  const sd = start.getDate();
  const ed = end.getDate();
  return sm === em ? `${sm} ${sd} — ${ed}` : `${sm} ${sd} — ${em} ${ed}`;
}

// Clamp target to within ±maxOffsetWeeks of defaultPlanWeek(today).
export function clampWeek(
  target: Date,
  today: Date,
  maxOffsetWeeks: number
): Date {
  const anchor = defaultPlanWeek(today);
  const min = addDays(anchor, -maxOffsetWeeks * 7);
  const max = addDays(anchor, maxOffsetWeeks * 7);
  if (target.getTime() < min.getTime()) return min;
  if (target.getTime() > max.getTime()) return max;
  return target;
}
