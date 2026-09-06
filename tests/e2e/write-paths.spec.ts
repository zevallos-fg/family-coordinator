import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, fixtureFamilyId } from "./helpers/fixture";

/**
 * The three features that could not write a row, driven through their real forms
 * and then checked against the database.
 *
 * Each test does the thing a person would do and then asks the table whether it
 * happened. That second half is the point: all three of these used to "work" as
 * far as the screen was concerned — one crashed, two showed an error, and none
 * of them ever stored anything.
 */
test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let familyId: string;
let tag: string;

test.beforeAll(async ({}, testInfo) => {
  admin = adminClient();
  familyId = fixtureFamilyId();
  tag = `E2E write path (${testInfo.project.name})`;
  await wipe();
});

/** Everything this file can create, addressed by its own project's tag. */
async function wipe() {
  const { data: kids } = await admin
    .from("kids")
    .select("id")
    .eq("family_id", familyId)
    .eq("name", tag);
  for (const kid of kids ?? []) await admin.from("medical_events").delete().eq("kid_id", kid.id);
  await admin.from("kids").delete().eq("family_id", familyId).eq("name", tag);
  // ilike, not eq: createCaregiver title-cases the NAME (deliberately — it is a
  // proper noun), so the stored value is not the string this test submitted.
  await admin.from("caregivers").delete().eq("family_id", familyId).ilike("name", tag);
  await admin.from("seasonal_checklists").delete().eq("family_id", familyId).eq("item_text", tag);
}

test.afterEach(async () => {
  await wipe();
});

test("adding a caregiver stores a row instead of crashing the page", async ({ page }) => {
  await page.goto("/caregiver/caregivers/new");

  await page.locator('input[name="name"]').fill(tag);
  await page.locator('select[name="role"]').selectOption("grandparent");
  await page.getByRole("button", { name: "Add caregiver" }).click();

  // The old behaviour: a thrown Server Action error and a blank crash screen.
  await expect(page).toHaveURL(/\/caregiver\/caregivers$/);
  await expect(page.getByText("A server error occurred")).toHaveCount(0);

  const { data } = await admin
    .from("caregivers")
    .select("name, role")
    .eq("family_id", familyId)
    .ilike("name", tag);

  expect(data).toHaveLength(1);
  // Stored lowercase; the capital G belongs to the label, not the value.
  expect(data![0].role).toBe("grandparent");
  await expect(page.getByText("Grandparent").first()).toBeVisible();
});

test("every role the dropdown offers is one the database will take", async ({ page }) => {
  await page.goto("/caregiver/caregivers/new");

  const offered = await page.locator('select[name="role"] option').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLOptionElement).value)
  );
  expect(offered.length).toBeGreaterThan(0);
  // "au_pair" was offered here for as long as the form existed, and choosing it
  // was one of the ways to crash the page.
  expect(offered).not.toContain("au_pair");

  for (const role of offered) {
    const { data, error } = await admin
      .from("caregivers")
      .insert({ family_id: familyId, name: tag, role })
      .select("id")
      .single();
    expect(error, `the form offers "${role}", so the column must accept it`).toBeNull();
    if (data) await admin.from("caregivers").delete().eq("id", data.id);
  }
});

test("logging a medical event stores a row", async ({ page }) => {
  const { data: kid, error: kidError } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: tag, birth_date: "2024-01-01" })
    .select("id")
    .single();
  expect(kidError).toBeNull();

  await page.goto(`/kids/${kid!.id}/medical`);
  await page.getByRole("button", { name: "+ Log medical event" }).click();

  await page.locator('input[type="date"]').first().fill("2026-09-06");
  await page.locator('select[name="event_type"]').selectOption("checkup");
  await page.getByRole("button", { name: "Save Event" }).click();

  // Every option in the old dropdown produced this.
  await expect(page.getByText("Could not save medical event")).toHaveCount(0);

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("medical_events")
        .select("event_type")
        .eq("kid_id", kid!.id);
      return data?.length ?? 0;
    })
    .toBe(1);

  const { data } = await admin.from("medical_events").select("event_type").eq("kid_id", kid!.id);
  expect(data![0].event_type).toBe("checkup");
  // Stored as the value, shown as the label.
  await expect(page.getByText("Checkup or well-child visit")).toBeVisible();
});

test("every medical event type the form offers is one the database will take", async ({
  page,
}) => {
  const { data: kid } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: tag })
    .select("id")
    .single();

  await page.goto(`/kids/${kid!.id}/medical`);
  await page.getByRole("button", { name: "+ Log medical event" }).click();

  const offered = await page
    .locator('select[name="event_type"] option')
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLOptionElement).value).filter(Boolean)
    );
  expect(offered.length).toBeGreaterThan(0);

  for (const event_type of offered) {
    const { data, error } = await admin
      .from("medical_events")
      .insert({
        family_id: familyId,
        kid_id: kid!.id,
        event_type,
        event_date: "2026-09-06",
      })
      .select("id")
      .single();
    expect(error, `the form offers "${event_type}", so the column must accept it`).toBeNull();
    if (data) await admin.from("medical_events").delete().eq("id", data.id);
  }
});

test("ticking a hurricane item is stored and the row reads as settled", async ({ page }) => {
  const { error } = await admin.from("seasonal_checklists").insert({
    family_id: familyId,
    season: "hurricane_2026_active_season",
    item_text: tag,
    status: "open",
  });
  expect(error, "generation writes this exact status").toBeNull();

  await page.goto("/hurricane");
  await expect(page.getByText(tag)).toBeVisible();

  await page
    .locator("li, div")
    .filter({ hasText: tag })
    .getByRole("button", { name: "Done" })
    .last()
    .click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("seasonal_checklists")
        .select("status")
        .eq("family_id", familyId)
        .eq("item_text", tag);
      return data?.[0]?.status ?? null;
    })
    .toBe("done");

  // And the row reads as settled after a reload. Asserted per item rather than
  // on the page percentage: both Playwright projects share one fixture family,
  // so the family-wide totals move under each other. The percentage maths itself
  // is covered by isChecklistSettled in lib/db/enums.test.ts, which is where the
  // "completed"/"n_a" comparison that pinned it at 0% actually lived.
  await page.reload();
  await expect(
    page
      .locator("li")
      .filter({ hasText: tag })
      .getByRole("button", { name: "Done" })
  ).toHaveCount(0);
});
