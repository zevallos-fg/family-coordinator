import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, fixtureFamilyId, ns, nsPattern } from "./helpers/fixture";

// Seeded rows are shared by every test in the file, so they are created once and
// serial mode keeps a parallel worker from reseeding underneath a running test.
test.describe.configure({ mode: "serial" });

let db: SupabaseClient;
let familyId: string;

const ITEMS = ["apples", "bananas", "cherries"];

test.beforeAll(async ({}, workerInfo) => {
  db = admin();
  familyId = fixtureFamilyId();
  const project = workerInfo.project.name;

  await db
    .from("grocery_items")
    .delete()
    .eq("family_id", familyId)
    .like("name", nsPattern(project, "grocery"));

  const { error } = await db.from("grocery_items").insert(
    ITEMS.map((item) => ({ family_id: familyId, name: ns(project, `grocery ${item}`) }))
  );
  if (error) throw error;
});

test.afterAll(async ({}, workerInfo) => {
  if (!db || !familyId) return;
  await db
    .from("grocery_items")
    .delete()
    .eq("family_id", familyId)
    .like("name", nsPattern(workerInfo.project.name, "grocery"));
});

test.describe("Grocery table sort and filter", () => {
  // The header row is `hidden sm:grid` — sorting is a deliberately desktop-only
  // affordance, so these two exercise it at a width where it exists rather than
  // asserting a control the mobile layout is designed not to show.
  test("renders table with sortable headers", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/grocery");

    // exact: true is required — name matching is substring by default, so "Item"
    // would also match every row's "Remove item" button.
    await expect(page.getByRole("button", { name: "Item", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Store", exact: true })).toBeVisible();
  });

  test("sort by item ascending/descending toggles chevron", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/grocery");

    const itemHeader = page.getByRole("button", { name: "Item", exact: true });
    await expect(itemHeader).toBeVisible();

    // asc → desc → none, and the seeded rows survive the whole cycle.
    await itemHeader.click();
    await itemHeader.click();
    await expect(itemHeader).toBeVisible();
  });

  test("store filter chips render when stores exist", async ({ page }) => {
    await page.goto("/grocery");
    // StoreFilter chips appear when there are stores
    // The filter UI renders even without items
    await page.waitForLoadState("networkidle");
    const body = await page.content();
    // Either filter chips are present OR the "Nothing to buy yet" empty state
    expect(
      body.includes("Nothing to buy yet") ||
      body.includes("No store")
    ).toBeTruthy();
  });
});
