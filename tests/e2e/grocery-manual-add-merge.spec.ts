import { test, expect } from "@playwright/test";

test.describe("Grocery manual add merge indicator", () => {
  test("add input renders with Add button", async ({ page }) => {
    await page.goto("/grocery");
    const addInput = page.getByPlaceholder(/gallons of milk|bananas|eggs/i);
    const addButton = page.getByRole("button", { name: /^Add/i });
    await expect(addInput).toBeVisible();
    await expect(addButton).toBeVisible();
  });

  test("empty input keeps Add button disabled", async ({ page }) => {
    await page.goto("/grocery");
    const addButton = page.getByRole("button", { name: /^Add/i });
    await expect(addButton).toBeDisabled();
  });

  test("typing enables Add button", async ({ page }) => {
    await page.goto("/grocery");
    const addInput = page.getByPlaceholder(/gallons of milk|bananas|eggs/i);
    const addButton = page.getByRole("button", { name: /^(Add|Add & merge)/i });
    await addInput.fill("watermelon");
    await expect(addButton).not.toBeDisabled();
  });
});
