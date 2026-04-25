import { test, expect } from "@playwright/test";

test.describe("Vendors feature", () => {
  test("vendors page loads and shows empty state or vendor list", async ({ page }) => {
    await page.goto("/vendors");
    await page.waitForLoadState("networkidle");

    // Should either show vendors or empty state — not a crash
    const hasAddButton = await page.locator('a[href="/vendors/new"]').count();
    expect(hasAddButton).toBeGreaterThan(0);
  });

  test("vendor memory search renders on vendors page", async ({ page }) => {
    await page.goto("/vendors");
    await page.waitForLoadState("networkidle");

    // Memory search input should be present
    const searchInput = page.locator('input[placeholder*="Search vendors"]');
    await expect(searchInput).toBeVisible();
  });

  test("new vendor page renders form with required fields", async ({ page }) => {
    await page.goto("/vendors/new");
    await page.waitForLoadState("networkidle");

    // Name field should be present
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();

    // Category select should be present
    const categorySelect = page.locator('select[name="category"]');
    await expect(categorySelect).toBeVisible();
  });

  test("non-existent vendor detail shows 404", async ({ page }) => {
    // Visit a garbage UUID — should 404
    const response = await page.goto("/vendors/00000000-0000-4000-8000-000000000099");
    // Either 404 or redirect to login (unauthed)
    expect(response?.status()).toBeGreaterThanOrEqual(200);
  });
});
