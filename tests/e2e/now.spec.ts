import { test, expect } from "@playwright/test";
import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, TEST_CONTEXT } from "./global-setup";

// These tests mutate a chore, so they must not race each other.
test.describe.configure({ mode: "serial" });

const CADENCE_DAYS = 7;
const DAYS_UNTIL_DUE = 3;

// Both projects run this file concurrently against the same test family, so each
// namespaces its own chore rather than wiping the table out from under the other.
function choreItem(projectName: string) {
  return `E2E chore (${projectName})`;
}

function isoDaysFromToday(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

let admin: SupabaseClient;
let familyId: string;

type ChoreRow = { id: string; last_done_at: string | null; next_due_at: string };

async function readChore(item: string): Promise<ChoreRow> {
  const { data, error } = await admin
    .from("maintenance")
    .select("id, last_done_at, next_due_at")
    .eq("family_id", familyId)
    .eq("item", item)
    .single();
  if (error) throw error;
  return data as ChoreRow;
}

test.beforeAll(async () => {
  admin = adminClient();
  familyId = JSON.parse(fs.readFileSync(TEST_CONTEXT, "utf8")).familyId;
});

test.beforeEach(async ({}, testInfo) => {
  const item = choreItem(testInfo.project.name);
  await admin.from("maintenance").delete().eq("family_id", familyId).eq("item", item);

  // next_due_at is GENERATED ALWAYS AS (coalesce(last_done_at, start_date) + cadence_days),
  // so the due date is steered through start_date, never written directly.
  const { error } = await admin.from("maintenance").insert({
    family_id: familyId,
    item,
    cadence_days: CADENCE_DAYS,
    start_date: isoDaysFromToday(DAYS_UNTIL_DUE - CADENCE_DAYS),
  });
  if (error) throw error;
});

test.afterAll(async () => {
  if (admin && familyId) {
    await admin.from("maintenance").delete().eq("family_id", familyId).like("item", "E2E chore%");
  }
});

test.describe("Now surface", () => {
  test("/now returns 200 and renders the Now heading", async ({ page }) => {
    const response = await page.goto("/now");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Now", level: 1 })).toBeVisible();
  });

  test("seeded chore appears under This week", async ({ page }, testInfo) => {
    const item = choreItem(testInfo.project.name);
    await page.goto("/now");

    const section = page.locator("section").filter({
      has: page.getByRole("heading", { name: "This week", level: 2 }),
    });
    await expect(section).toBeVisible();
    await expect(section.getByText(item, { exact: true })).toBeVisible();
  });

  test("completing a chore advances its due date by cadence_days", async ({
    page,
  }, testInfo) => {
    const item = choreItem(testInfo.project.name);
    const before = await readChore(item);
    expect(before.last_done_at).toBeNull();

    await page.goto("/now");
    await page.getByRole("button", { name: `Mark ${item} done` }).click();
    await expect(page.getByText(`${item} — next one scheduled`)).toBeVisible();

    // Assert against values the database itself reports, so the check does not
    // depend on the runner and Postgres agreeing about today's date.
    await expect
      .poll(async () => (await readChore(item)).last_done_at, { timeout: 10_000 })
      .not.toBeNull();

    const after = await readChore(item);
    const advancedBy =
      (Date.parse(after.next_due_at) - Date.parse(after.last_done_at!)) / 86_400_000;
    expect(advancedBy).toBe(CADENCE_DAYS);
    expect(Date.parse(after.next_due_at)).toBeGreaterThan(Date.parse(before.next_due_at));

    // ...and that the advance is what the reloaded page shows.
    await page.reload();
    // Anchor on the row's own checkbox: filtering by text alone resolves to the
    // inner title div, which does not contain the sibling day label.
    const row = page
      .locator("div")
      .filter({ has: page.getByRole("button", { name: `Mark ${item} done` }) })
      .last();
    await expect(row).toContainText(`${CADENCE_DAYS}d`);
  });

  test("More sheet contains an Organized link", async ({ page }) => {
    // MobileNav lives behind sm:hidden, so force a phone-width viewport in both projects.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/now");

    await page.getByRole("button", { name: "More" }).click();
    const organized = page.getByRole("link", { name: "Organized" });
    await expect(organized).toBeVisible();
    await expect(organized).toHaveAttribute("href", "/organized");
  });

  test("a bucket with no rows renders nothing at all", async ({ page }) => {
    // Confirm the premise before asserting on it: nothing is overdue for this family.
    const { data, error } = await admin
      .from("v_whats_due")
      .select("bucket")
      .eq("family_id", familyId)
      .eq("bucket", "overdue");
    if (error) throw error;
    expect(data ?? []).toHaveLength(0);

    await page.goto("/now");

    // Not an "all clear" message — the heading itself must be absent.
    await expect(page.getByRole("heading", { name: "Overdue", level: 2 })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "This week", level: 2 })).toBeVisible();
  });
});
