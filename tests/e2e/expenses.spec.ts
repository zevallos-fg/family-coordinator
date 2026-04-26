import { test, expect } from "@playwright/test";

test.describe("Expenses feature", () => {
  test("expenses page loads", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("reimbursements page loads", async ({ page }) => {
    await page.goto("/expenses/reimbursements");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});
