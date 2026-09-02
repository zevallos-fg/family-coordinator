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
    // KNOWN FAILING (webkit, under load) — app defect, not a selector problem.
    // If the fill lands before React hydrates, the text is visible but unowned:
    // `text` state stays "" and the button is disabled forever. React seeds its
    // input-value tracker from the DOM at hydration, so re-entering the SAME
    // string raises no change event and cannot recover it; only editing to a
    // different value does. A real user typing fast on a slow connection hits
    // this. Do not "fix" this by clearing and refilling — that hides the bug.
    await addInput.fill("watermelon");
    await expect(addButton).not.toBeDisabled();
  });
});
