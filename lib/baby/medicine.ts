import type { Json } from "@/lib/supabase/database.types";
import { formatTimeOfDay } from "./format";

/**
 * Medicine, as recorded — never as calculated.
 *
 * A dose row carries the medication's id, name and dose exactly as the parent
 * entered them, so the history still reads correctly if the medicine is later
 * stopped. Nothing in this module computes or adjusts a dose.
 */

export function medicinePayload(med: {
  id: string | null;
  name: string | null;
  dose: string | null;
}): Record<string, Json> {
  if (!med.id || !med.name) throw new Error("a dose needs a tracked medicine");
  return {
    medication_id: med.id,
    name: med.name,
    ...(med.dose ? { dose: med.dose } : {}),
  };
}

/** "" -> null (as needed); "6", "4.5" -> hours; anything else -> "invalid". */
export function parseInterval(input: string): number | null | "invalid" {
  const text = input.trim();
  if (text === "") return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return "invalid";
  const n = Number(text);
  return n > 0 && n <= 24 * 30 ? n : "invalid";
}

/** "Next: 4:30 pm" or "Due now" / "Overdue since 4:30 pm"; null when there is no schedule. */
export function nextDueLabel(
  nextDueAt: string | null | undefined,
  nowMs: number = Date.now()
): { text: string; overdue: boolean } | null {
  if (!nextDueAt) return null;
  const due = Date.parse(nextDueAt);
  if (!Number.isFinite(due)) return null;
  if (due > nowMs) return { text: `Next: ${formatTimeOfDay(nextDueAt)}`, overdue: false };
  if (nowMs - due < 5 * 60_000) return { text: "Due now", overdue: true };
  return { text: `Due since ${formatTimeOfDay(nextDueAt)}`, overdue: true };
}
