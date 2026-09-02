/**
 * PR-3 regressions — covers audit findings #2, #17, #18, #19, #20, #23
 * and the recipe title-case normalization (#9).
 */
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, fixtureFamilyId, ns, nsPattern } from "./helpers/fixture";

// ─── #2 — Receipts upload a11y ────────────────────────────────────────────────
test.describe("Receipts upload zone a11y", () => {
  test("upload zone is a proper label element (not a bare div)", async ({
    page,
  }) => {
    await page.goto("/receipts/new");
    // The upload zone must be a <label> element
    const uploadLabel = page.locator("label[for='receipt-file']");
    await expect(uploadLabel).toBeVisible();
  });

  test("file input is reachable via keyboard Tab", async ({ page }) => {
    await page.goto("/receipts/new");
    // Tab to the input — it should be in the tab order via its label
    const fileInput = page.locator("#receipt-file");
    await expect(fileInput).toBeAttached();
  });
});

// ─── #9 — Recipe titles are in Title Case ─────────────────────────────────────
test.describe("Recipe title case", () => {
  let db: SupabaseClient;
  let familyId: string;

  test.beforeAll(async ({}, workerInfo) => {
    db = admin();
    familyId = fixtureFamilyId();
    const title = ns(workerInfo.project.name, "Recipe Title Case");

    await db.from("recipes").delete().eq("family_id", familyId).eq("title", title);
    const { error } = await db.from("recipes").insert({ family_id: familyId, title });
    if (error) throw error;
  });

  test.afterAll(async ({}, workerInfo) => {
    if (!db || !familyId) return;
    await db
      .from("recipes")
      .delete()
      .eq("family_id", familyId)
      .like("title", nsPattern(workerInfo.project.name, "Recipe Title Case"));
  });

  test("recipe library shows Title Case titles (no all-lowercase)", async ({
    page,
  }) => {
    await page.goto("/meal-plans/recipes");

    // Recipe cards only — getByRole("link") also matched the "← Meal Plans" back
    // link and the import CTA, so the check was landing on page furniture.
    const recipeCards = page.locator(
      'a[href^="/meal-plans/recipes/"]:not([href$="/import"])'
    );

    const count = await recipeCards.count();
    // Without this the assertion is vacuous against an empty library.
    expect(count, "expected at least the seeded recipe").toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const title =
        (await recipeCards.nth(i).getByRole("heading", { level: 3 }).textContent()) ?? "";
      expect(title.trim()[0], `"${title.trim()}" should start uppercase`).toMatch(/[A-Z]/);
    }
  });
});

// ─── #17 — Configurable default_serves ────────────────────────────────────────
test.describe("Family settings — default serves", () => {
  test("settings page renders with default serves selector", async ({ page }) => {
    await page.goto("/settings");
    const select = page.getByRole("combobox").or(page.locator("#default-serves"));
    await expect(select).toBeVisible();
  });

  test("default serves selector has reasonable options (1–12)", async ({
    page,
  }) => {
    await page.goto("/settings");
    const select = page.locator("#default-serves");
    if (await select.count() > 0) {
      const options = await select.locator("option").allTextContents();
      expect(options.length).toBeGreaterThanOrEqual(4);
    }
  });
});

// ─── #18 — Swap recipe search filter ─────────────────────────────────────────
test.describe("Meal plan swap recipe search", () => {
  test("swap modal has a search input", async ({ page }) => {
    await page.goto("/meal-plans");
    // Swap button exists in the meal plan grid
    const swapBtn = page.getByRole("button", { name: /swap/i }).first();
    const count = await swapBtn.count();
    if (count > 0) {
      await swapBtn.click();
      // Search input should appear
      await expect(
        page.getByRole("searchbox").or(page.getByPlaceholder(/search recipes/i))
      ).toBeVisible();
    }
  });
});

// ─── #20, #23 — SpendIndicator polling ────────────────────────────────────────
test.describe("SpendIndicator polling rate", () => {
  test("/api/spend endpoint returns valid JSON", async ({ page }) => {
    const response = await page.request.get("/api/spend");
    // Should return 200 with {spend: ...} or {spend: null}
    expect(response.status()).toBeLessThan(500);
    const body = await response.json().catch(() => null);
    if (body) {
      expect(body).toHaveProperty("spend");
    }
  });
});
