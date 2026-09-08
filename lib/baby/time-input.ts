/**
 * Conversions for the START TIME control, which is a plain
 * `<input type="datetime-local">`.
 *
 * That input speaks local wall-clock with no zone, and the database speaks
 * timestamptz. Both directions have to go through Date so the offset is applied
 * once and in the right direction — the failure mode being a feed logged at 3am
 * that lands in the row as 8am, which nobody notices until the day's totals are
 * wrong.
 *
 * The control exists because the export shows entries are routinely logged after
 * the fact: you feed the baby and write it down twenty minutes later. Defaulting
 * to now and making it editable in one tap is the difference between a log that
 * is roughly true and one that is exactly true.
 */

/** ISO instant -> "YYYY-MM-DDTHH:mm" in the viewer's own zone. */
export function toLocalInputValue(iso: string | Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * "YYYY-MM-DDTHH:mm" -> ISO instant, or null if the field is empty or unparseable.
 *
 * Null rather than a fallback to now: a value that cannot be read is a question
 * for the person, not something to guess at. Callers that want "now" say so.
 */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Whether a start time is far enough from now to be worth showing as edited. */
export function isBackdated(value: string, now: number = Date.now()): boolean {
  const iso = fromLocalInputValue(value);
  if (!iso) return false;
  // A minute of slack: the control only has minute resolution, so "now" drifts
  // into the past the moment it is rendered.
  return now - new Date(iso).getTime() > 90_000;
}
