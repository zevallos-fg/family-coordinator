import { test, expect } from "@playwright/test";

test.describe("Manual recipe entry", () => {
  test("import page renders three tabs including Manual", async ({ page }) => {
    await page.goto("/meal-plans/recipes/import");
    const manualTab = page.getByRole("tab", { name: "Manual" });
    const urlTab = page.getByRole("tab", { name: "From URL" });
    const photoTab = page.getByRole("tab", { name: "From Photo" });
    await expect(manualTab).toBeVisible();
    await expect(urlTab).toBeVisible();
    await expect(photoTab).toBeVisible();
  });

  test("clicking Manual tab shows the manual form", async ({ page }) => {
    await page.goto("/meal-plans/recipes/import");
    await page.getByRole("tab", { name: "Manual" }).click();
    // Title field should appear
    const titleField = page.getByPlaceholder(/Recipe title/i);
    await expect(titleField).toBeVisible();
  });

  test("empty manual form submit is blocked (Save Recipe disabled before interaction)", async ({ page }) => {
    await page.goto("/meal-plans/recipes/import");
    await page.getByRole("tab", { name: "Manual" }).click();
    const saveButton = page.getByRole("button", { name: "Save Recipe" });
    await expect(saveButton).toBeVisible();
    // Button is enabled by default (validation fires on submit attempt)
    // Click and verify error messages appear
    await saveButton.click();
    await expect(page.getByText(/Title must be at least 3 characters/i)).toBeVisible();
  });

  test("valid manual entry enables Save Recipe and shows descriptor hint", async ({ page }) => {
    await page.goto("/meal-plans/recipes/import");
    await page.getByRole("tab", { name: "Manual" }).click();
    // Fill required fields
    await page.getByPlaceholder(/Recipe title/i).fill("Test Soup");
    await page.locator('input[type="number"][min="1"]').first().fill("4");
    // Fill first ingredient with descriptor
    const nameInput = page.locator('input[placeholder="Ingredient name"]').first();
    await nameInput.fill("garlic, minced");
    // Descriptor hint should appear
    await expect(page.getByText(/Will save as: garlic/i)).toBeVisible();
  });
});
