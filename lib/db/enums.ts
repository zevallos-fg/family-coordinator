/**
 * The values four CHECK-constrained text columns will actually accept.
 *
 * These columns are `text` with a `CHECK (col = ANY (ARRAY[...]))`. `supabase gen
 * types` cannot see a CHECK, so it emits `string`, and the compiler happily let
 * four features ship strings the database was never going to take: caregiver
 * roles were title-cased into `Nanny`, medical events offered nine labels none of
 * which were valid, the hurricane checklist wrote `pending`/`completed`/`n_a`,
 * and trip prep tasks wrote `pending`. Three features could not write at all; the
 * fourth dropped its rows in silence.
 *
 * Until the columns become real Postgres enums — at which point the generated
 * types carry the union and a wrong value is a compile error — this module is the
 * single place those values are written down, and the `parse*` helpers are the
 * only sanctioned way to turn a form string into one.
 *
 * Storage values are lower_snake and are never displayed. Display casing belongs
 * to the label maps below and to nothing else: putting it on the value is exactly
 * what broke `createCaregiver`.
 */

export const CAREGIVER_ROLES = ["nanny", "grandparent", "daycare", "other"] as const;
export type CaregiverRole = (typeof CAREGIVER_ROLES)[number];

export const CAREGIVER_ROLE_LABEL: Record<CaregiverRole, string> = {
  nanny: "Nanny",
  grandparent: "Grandparent",
  daycare: "Daycare",
  other: "Other",
};

export const MEDICAL_EVENT_TYPES = [
  "checkup",
  "illness",
  "vaccine",
  "question",
  "other",
] as const;
export type MedicalEventType = (typeof MEDICAL_EVENT_TYPES)[number];

/**
 * The old dropdown offered nine clinic-visit names — "Well-child visit", "Dental
 * checkup", "ER visit" and so on. They are kept here as labels for the five real
 * values rather than thrown away, so the form still reads like a form.
 */
export const MEDICAL_EVENT_TYPE_LABEL: Record<MedicalEventType, string> = {
  checkup: "Checkup or well-child visit",
  illness: "Illness or injury",
  vaccine: "Vaccination",
  question: "Question for the doctor",
  other: "Other",
};

export const CHECKLIST_STATUSES = ["open", "done", "na"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

function parser<T extends string>(allowed: readonly T[]) {
  return (raw: unknown): T | null => {
    if (typeof raw !== "string") return null;
    const v = raw.trim().toLowerCase();
    return (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
}

/**
 * Narrow an untrusted form value, or return null so the caller can reject it with
 * a message instead of handing the database something it will refuse.
 */
export const parseCaregiverRole = parser(CAREGIVER_ROLES);
export const parseMedicalEventType = parser(MEDICAL_EVENT_TYPES);
export const parseChecklistStatus = parser(CHECKLIST_STATUSES);
export const parseTaskStatus = parser(TASK_STATUSES);

/** A checklist row counts as dealt with whether it was done or ruled out. */
export function isChecklistSettled(status: string): boolean {
  return status === "done" || status === "na";
}
