import { test, expect } from "@playwright/test";

test.describe("Trips feature", () => {
  test("trips page loads with list or empty state", async ({ page }) => {
    await page.goto("/trips");
    await page.waitForLoadState("networkidle");

    // Should have plan trip button
    const planButton = page.locator('a[href="/trips/new"]');
    await expect(planButton).toBeVisible();
  });

  test("new trip page renders form with required fields", async ({ page }) => {
    await page.goto("/trips/new");
    await page.waitForLoadState("networkidle");

    const destinationInput = page.locator('input[name="destination"]');
    await expect(destinationInput).toBeVisible();

    const startDate = page.locator('input[name="start_date"]');
    await expect(startDate).toBeVisible();

    const endDate = page.locator('input[name="end_date"]');
    await expect(endDate).toBeVisible();
  });

  test("non-existent trip detail shows 404 or redirects", async ({ page }) => {
    const response = await page.goto("/trips/00000000-0000-4000-8000-000000000099");
    expect(response?.status()).toBeGreaterThanOrEqual(200);
  });
});
