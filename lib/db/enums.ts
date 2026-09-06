import { Constants, type Database } from "@/lib/supabase/database.types";

/**
 * The four columns that used to be `text` with a CHECK, and are now real
 * Postgres enums.
 *
 * WHAT CHANGED, AND WHY IT MATTERS
 * `supabase gen types` cannot see a CHECK constraint, so these columns were typed
 * `string` and the compiler could not reject a wrong value. Four features shipped
 * strings the database was never going to accept: caregiver roles were
 * title-cased into `Nanny`, medical events offered nine labels none of which were
 * valid, the hurricane checklist wrote `pending`/`completed`/`n_a`, and trip prep
 * tasks wrote `pending`. Three features could not write at all; the fourth
 * dropped its rows in silence.
 *
 * Migration 20260906193358_check_columns_to_enums converted them. The values and
 * types below are now READ FROM THE GENERATED FILE rather than typed out again —
 * `Constants.public.Enums` comes straight from the database — so the list cannot
 * drift from the column, and a value the column will not take is a compile error.
 * That is the whole point of the conversion; hand-maintaining a second copy here
 * would have given it back.
 *
 * What still lives here is everything the database has no opinion about: the
 * display labels, and the parsers that narrow an untrusted form field. Storage
 * values are lower_snake and are never displayed. Putting display casing on the
 * value is exactly what broke createCaregiver.
 */

export const CAREGIVER_ROLES = Constants.public.Enums.caregiver_role;
export type CaregiverRole = Database["public"]["Enums"]["caregiver_role"];

export const MEDICAL_EVENT_TYPES = Constants.public.Enums.medical_event_type;
export type MedicalEventType = Database["public"]["Enums"]["medical_event_type"];

export const CHECKLIST_STATUSES = Constants.public.Enums.checklist_status;
export type ChecklistStatus = Database["public"]["Enums"]["checklist_status"];

export const TASK_STATUSES = Constants.public.Enums.task_status;
export type TaskStatus = Database["public"]["Enums"]["task_status"];

/**
 * Labels are exhaustive by type. Add a value to the enum in the database,
 * regenerate, and these stop compiling until someone decides what it is called —
 * which is the correct moment to be asked.
 */
export const CAREGIVER_ROLE_LABEL: Record<CaregiverRole, string> = {
  nanny: "Nanny",
  grandparent: "Grandparent",
  daycare: "Daycare",
  au_pair: "Au Pair",
  other: "Other",
};

/**
 * The old dropdown offered nine clinic-visit names — "Well-child visit", "Dental
 * checkup", "ER visit" and so on — as values. They are kept here as labels for
 * the five real values rather than thrown away, so the form still reads like a
 * form.
 */
export const MEDICAL_EVENT_TYPE_LABEL: Record<MedicalEventType, string> = {
  checkup: "Checkup or well-child visit",
  illness: "Illness or injury",
  vaccine: "Vaccination",
  question: "Question for the doctor",
  other: "Other",
};

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
