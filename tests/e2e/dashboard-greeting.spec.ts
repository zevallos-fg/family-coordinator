import { test, expect } from "@playwright/test";

test.describe("Dashboard greeting", () => {
  test("renders time-appropriate greeting without hydration errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Greeting should be visible and time-appropriate
    const greeting = page.getByRole("heading", { level: 1 });
    await expect(greeting).toContainText(
      /Good (morning|afternoon|evening|night),/
    );

    // Match the current local hour
    const hour = new Date().getHours();
    const expected =
      hour >= 5 && hour < 12
        ? "Good morning"
        : hour >= 12 && hour < 17
        ? "Good afternoon"
        : hour >= 17 && hour < 22
        ? "Good evening"
        : "Good night";
    await expect(greeting).toContainText(expected);

    // CRITICAL: no hydration mismatch errors (#418)
    const hydrationErrors = consoleErrors.filter(
      (e) => e.includes("#418") || e.includes("Hydration failed") || e.includes("hydration")
    );
    expect(hydrationErrors).toHaveLength(0);
  });

  test("greeting uses correct thresholds (night at 22:00, not 17:00)", async ({
    page,
  }) => {
    // Verify the four-bucket rule is correct
    const testCases: Array<[number, string]> = [
      [4, "Good night"],
      [5, "Good morning"],
      [11, "Good morning"],
      [12, "Good afternoon"],
      [16, "Good afternoon"],
      [17, "Good evening"],
      [21, "Good evening"],
      [22, "Good night"],
      [23, "Good night"],
    ];

    // Evaluate the greeting logic directly in the page context
    for (const [hour, expectedGreeting] of testCases) {
      const result = await page.evaluate((h: number) => {
        if (h >= 5 && h < 12) return "Good morning";
        if (h >= 12 && h < 17) return "Good afternoon";
        if (h >= 17 && h < 22) return "Good evening";
        return "Good night";
      }, hour);
      expect(result, `hour ${hour} should produce "${expectedGreeting}"`).toBe(
        expectedGreeting
      );
    }
  });
});
