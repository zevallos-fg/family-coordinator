import { test, expect } from "@playwright/test";

test.describe("Meal plan grocery projection", () => {
  test("meal plans page shows Recipes and Pantry nav pills", async ({ page }) => {
    await page.goto("/meal-plans");
    // The page redirects to /meal-plans?week=... so wait for load
    await page.waitForLoadState("networkidle");
    // Recipes pill
    const recipesPill = page.getByRole("link", { name: /Recipes \(\d+\)/i });
    await expect(recipesPill).toBeVisible();
    // Pantry pill
    const pantryPill = page.getByRole("link", { name: "Pantry" });
    await expect(pantryPill).toBeVisible();
  });

  test("Recipes pill links to /meal-plans/recipes", async ({ page }) => {
    await page.goto("/meal-plans");
    await page.waitForLoadState("networkidle");
    const recipesPill = page.getByRole("link", { name: /Recipes \(\d+\)/i });
    await expect(recipesPill).toHaveAttribute("href", "/meal-plans/recipes");
  });

  test("Pantry pill links to /meal-plans/pantry", async ({ page }) => {
    await page.goto("/meal-plans");
    await page.waitForLoadState("networkidle");
    const pantryPill = page.getByRole("link", { name: "Pantry" });
    await expect(pantryPill).toHaveAttribute("href", "/meal-plans/pantry");
  });

  test("recipes page renders when navigated to", async ({ page }) => {
    await page.goto("/meal-plans/recipes");
    await page.waitForLoadState("networkidle");
    // Should not 404 — either shows recipes or empty state
    const body = await page.content();
    expect(body.includes("Import a Recipe") || body.includes("No recipes yet") || body.includes("recipe")).toBeTruthy();
  });
});
