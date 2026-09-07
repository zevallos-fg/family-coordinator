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
    // This was the witness for a real defect, and it is now the guard against
    // its return. If the fill lands before React hydrates, a controlled input
    // leaves the text visible but unowned: `text` state stays "" and the button
    // is disabled forever. React seeds its input-value tracker from the DOM at
    // hydration, so re-entering the SAME string raises no change event and
    // cannot recover it; only editing to a different value does.
    //
    // AddItemForm's input is uncontrolled and adopts the DOM value on mount, so
    // this passes whenever the fill lands. If it ever fails again, that is the
    // race returning — do not clear and refill to get past it, and do not add a
    // retry. Both hide it.
    await addInput.fill("watermelon");
    await expect(addButton).not.toBeDisabled();
  });
});
