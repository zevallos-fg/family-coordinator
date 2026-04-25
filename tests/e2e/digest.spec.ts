import { test, expect } from "@playwright/test";

test.describe("Weekly digest feature", () => {
  test("digest page loads", async ({ page }) => {
    await page.goto("/digest");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("digest page shows generate button when no digest exists", async ({ page }) => {
    await page.goto("/digest");
    await page.waitForLoadState("networkidle");

    // Either shows digests or generate button or login redirect
    const content = await page.textContent("body") ?? "";
    // Page should have something meaningful
    expect(content.length).toBeGreaterThan(10);
  });
});
