import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, fixtureFamilyId } from "./helpers/fixture";

/**
 * The five P3 findings from the adversarial sweep, each asserted where it was
 * observed rather than where it was fixed.
 */
test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let familyId: string;
let tag: string;

/** The Monday of the week containing `date`, as YYYY-MM-DD. */
function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function mondayPlusWeeks(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return mondayOf(d);
}

test.beforeAll(async ({}, testInfo) => {
  admin = adminClient();
  familyId = fixtureFamilyId();
  tag = `E2E sweep fix (${testInfo.project.name})`;
  await admin.from("documents").delete().eq("family_id", familyId).eq("title", tag);
});

test.afterAll(async () => {
  await admin.from("documents").delete().eq("family_id", familyId).eq("title", tag);
});

test("the week you are looking at is the week the copy names", async ({ page }) => {
  // From Friday, defaultPlanWeek opens on next Monday. The copy said "this week"
  // over it, so three days in seven /caregiver reported no shifts on a day a
  // shift was running. Driven by ?week= so the assertion holds on any weekday.
  await page.goto(`/caregiver?week=${mondayPlusWeeks(0)}`);
  await expect(page.getByRole("heading", { name: "Shifts this week" })).toBeVisible();

  await page.goto(`/caregiver?week=${mondayPlusWeeks(1)}`);
  await expect(page.getByRole("heading", { name: "Shifts next week" })).toBeVisible();
  // The empty state under that heading has a second branch for a family with no
  // kids or caregivers yet, and other specs add and remove both — so the week
  // wording is asserted on the two pages whose empty state has no precondition.

  await page.goto(`/meal-plans?week=${mondayPlusWeeks(1)}`);
  await expect(page.getByText("No meal plan yet for next week.")).toBeVisible();

  await page.goto(`/schedule?week=${mondayPlusWeeks(1)}`);
  await expect(page.getByText("No schedule for next week yet")).toBeVisible();

  // Far enough out and it gets named by its dates rather than by a relative word.
  await page.goto(`/caregiver?week=${mondayPlusWeeks(3)}`);
  await expect(page.getByRole("heading", { name: /Shifts the week of/ })).toBeVisible();
});

test("no other family's child is named in the copy", async ({ page }) => {
  // "Leo" was hardcoded into three strings every family saw. The fixture family
  // has no Leo, so any occurrence outside a form placeholder is the bug back.
  for (const route of ["/schedule", "/schedule/upload"]) {
    await page.goto(route);
    await expect(page.locator("body")).not.toContainText("Leo");
  }
});

test("/barcode is reachable without typing the URL", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/now");

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "Scan barcode" }).click();

  await expect(page).toHaveURL(/\/barcode$/);
});

test("an unindexed document offers a way out of 'Indexing in progress'", async ({
  page,
}) => {
  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      family_id: familyId,
      title: tag,
      file_url: "https://example.invalid/sweep.pdf",
    })
    .select("id, indexed_at")
    .single();
  expect(error).toBeNull();
  expect(doc!.indexed_at, "the state this test is about").toBeNull();

  await page.goto(`/documents/${doc!.id}`);

  await expect(page.getByText("Indexing in progress…")).toBeVisible();
  // The whole finding: the sentence with no button under it.
  await expect(page.getByTestId("retry-indexing")).toBeVisible();
});

test("/capture/new hydrates without a React error", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/capture/new");
  await page.waitForLoadState("networkidle");

  // Was: "Minified React error #418" on every single load, because VoiceButton
  // read window during render and so rendered nothing on the server.
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
