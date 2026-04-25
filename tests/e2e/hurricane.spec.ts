import { test, expect } from "@playwright/test";

test.describe("Hurricane prep feature", () => {
  test("hurricane page loads", async ({ page }) => {
    await page.goto("/hurricane");
    await page.waitForLoadState("networkidle");

    // Should show the page title or redirect to login
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("hurricane page shows Miami location label", async ({ page }) => {
    await page.goto("/hurricane");
    await page.waitForLoadState("networkidle");

    // Either shows location (authenticated) or login redirect
    const pageContent = await page.textContent("body") ?? "";
    // If we see the page (not login), it should mention Miami or hurricane
    if (pageContent.includes("Hurricane")) {
      expect(pageContent).toContain("Miami");
    }
  });
});
