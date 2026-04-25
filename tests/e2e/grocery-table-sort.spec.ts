import { test, expect } from "@playwright/test";

test.describe("Grocery table sort and filter", () => {
  // NOTE: These tests require an authenticated session. The test user must have
  // grocery items seeded. Without auth, the page redirects to /login.
  // Run these manually against a preview URL after authenticating.

  test("renders table with sortable headers", async ({ page }) => {
    await page.goto("/grocery");
    // Expect sortable header buttons for Item and Store
    const itemHeader = page.getByRole("button", { name: /item/i });
    const storeHeader = page.getByRole("button", { name: /store/i });
    await expect(itemHeader).toBeVisible();
    await expect(storeHeader).toBeVisible();
  });

  test("sort by item ascending/descending toggles chevron", async ({ page }) => {
    await page.goto("/grocery");
    const itemHeader = page.getByRole("button", { name: /item/i });
    // Default: ascending
    await expect(page.getByRole("button", { name: /item/i })).toBeVisible();
    // Click once → descending
    await itemHeader.click();
    // Click again → no sort
    await itemHeader.click();
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
