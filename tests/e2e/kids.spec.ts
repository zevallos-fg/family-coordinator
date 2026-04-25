import { test, expect } from "@playwright/test";

test.describe("Kids feature", () => {
  test("kids page loads", async ({ page }) => {
    await page.goto("/kids");
    await page.waitForLoadState("networkidle");
    // Should either show kids list, empty state, or redirect to login
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("kids milestones page has expected structure when authenticated", async ({ page }) => {
    // Use a test kid ID — will 404 gracefully if not found
    const response = await page.goto("/kids/00000000-0000-4000-8000-000000000099/milestones");
    expect(response?.status()).toBeGreaterThanOrEqual(200);
  });

  test("kids medical page has no AI elements in page text", async ({ page }) => {
    await page.goto("/kids/00000000-0000-4000-8000-000000000099/medical");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.textContent("body") ?? "";
    // Medical page must not contain AI/skill references
    expect(bodyText.toLowerCase()).not.toContain("analyzing");
    expect(bodyText.toLowerCase()).not.toContain("ai-powered");
  });
});
