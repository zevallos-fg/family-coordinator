import { test, expect } from "@playwright/test";

// Deliberately runs with a blank context. The rest of the suite is signed in via
// globalSetup, so without this the "auth actually gates the app" assertion would
// disappear the moment the fixture landed.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Auth guard (unauthenticated)", () => {
  test("/now redirects an unauthenticated visitor to /login", async ({ page }) => {
    await page.goto("/now");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Family Coordinator" })).toBeVisible();
  });
});
