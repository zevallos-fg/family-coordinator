import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, fixtureFamilyId } from "./helpers/fixture";
import {
  CAREGIVER_ROLES,
  CHECKLIST_STATUSES,
  MEDICAL_EVENT_TYPES,
  TASK_STATUSES,
} from "@/lib/db/enums";

/**
 * Does the database agree with lib/db/enums.ts?
 *
 * `supabase gen types` cannot see a CHECK constraint, so it types these four
 * columns `string` and the compiler cannot help. Four features shipped values the
 * database refuses, and three of them could not write a single row.
 *
 * This asks the database directly, one insert per value, rather than reading a
 * constraint definition — the question that matters is not what the constraint
 * says but what it accepts. Every allowed value must land; every value that
 * caused an outage must still be refused.
 *
 * When the columns become real enums (P1), these assertions should keep passing
 * unchanged — that is the point of writing them behaviourally.
 */
test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let familyId: string;
let kidId: string;
let tag: string;

test.beforeAll(async ({}, testInfo) => {
  admin = adminClient();
  familyId = fixtureFamilyId();
  // Both projects run this file at once against one fixture family, so every row
  // carries its project and each project only ever deletes its own.
  tag = `E2E enum parity (${testInfo.project.name})`;

  const { data, error } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: tag })
    .select("id")
    .single();
  if (error) throw error;
  kidId = data.id;
});

test.afterAll(async () => {
  await admin.from("medical_events").delete().eq("kid_id", kidId);
  await admin.from("kids").delete().eq("id", kidId);
  await admin.from("caregivers").delete().eq("family_id", familyId).eq("name", tag);
  await admin.from("tasks").delete().eq("family_id", familyId).eq("title", tag);
  await admin.from("seasonal_checklists").delete().eq("family_id", familyId).eq("item_text", tag);
});

/** Try one value; return the constraint error message, or null if it landed. */
async function attempt(
  table: string,
  row: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error) return error.message;
  await admin.from(table).delete().eq("id", data.id);
  return null;
}

test("caregivers.role accepts every role the app offers, and no title-cased form", async () => {
  for (const role of CAREGIVER_ROLES) {
    expect(
      await attempt("caregivers", { family_id: familyId, name: tag, role }),
      `role "${role}" is offered in the form and must be storable`
    ).toBeNull();
  }

  // The exact value createCaregiver used to send.
  expect(await attempt("caregivers", { family_id: familyId, name: tag, role: "Nanny" })).toContain(
    "invalid input value for enum caregiver_role"
  );
  // au_pair was refused for as long as the CHECK existed and is a real value
  // now; the loop above already inserted it, so this only pins the direction.
  expect(CAREGIVER_ROLES).toContain("au_pair");
});

test("medical_events.event_type accepts every type the form offers", async () => {
  for (const event_type of MEDICAL_EVENT_TYPES) {
    expect(
      await attempt("medical_events", {
        family_id: familyId,
        kid_id: kidId,
        event_type,
        event_date: "2026-09-06",
      }),
      `event_type "${event_type}" is offered in the form and must be storable`
    ).toBeNull();
  }

  // A label from the old dropdown. All nine were shaped like this.
  expect(
    await attempt("medical_events", {
      family_id: familyId,
      kid_id: kidId,
      event_type: "Well-child visit",
      event_date: "2026-09-06",
    })
  ).toContain("invalid input value for enum medical_event_type");
});

test("seasonal_checklists.status accepts every status the hurricane feature writes", async () => {
  for (const status of CHECKLIST_STATUSES) {
    expect(
      await attempt("seasonal_checklists", {
        family_id: familyId,
        season: "hurricane_2026_active_season",
        item_text: tag,
        status,
      }),
      `status "${status}" is written by the hurricane feature and must be storable`
    ).toBeNull();
  }

  for (const dead of ["pending", "completed", "n_a"]) {
    expect(
      await attempt("seasonal_checklists", {
        family_id: familyId,
        season: "hurricane_2026_active_season",
        item_text: tag,
        status: dead,
      }),
      `"${dead}" broke generation and ticking; it must stay rejected`
    ).toContain("invalid input value for enum checklist_status");
  }
});

test("tasks.status accepts every status the app writes — the silent one", async () => {
  for (const status of TASK_STATUSES) {
    expect(
      await attempt("tasks", { family_id: familyId, title: tag, status }),
      `status "${status}" must be storable`
    ).toBeNull();
  }

  // createTrip wrote this and never read the error, so every prep task a trip
  // has ever generated was discarded without a trace.
  expect(await attempt("tasks", { family_id: familyId, title: tag, status: "pending" })).toContain(
    "invalid input value for enum task_status"
  );
});
