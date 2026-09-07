import { defineConfig, devices } from "@playwright/test";

const STORAGE_STATE = "./tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries, in CI or out of it. grocery-manual-add-merge was a real
  // hydration race that passed on a second attempt, and a retry that turns a
  // real race green is the same failure as everything else fixed this week: a
  // control reporting healthy because it stopped looking.
  retries: 0,
  reporter: process.env.CI ? [["html"], ["github"]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"], storageState: STORAGE_STATE },
      // Contractions are family-scoped and carry no name to namespace them, and
      // fn_baby_toggle closes whichever row of a type is open — so the two
      // projects running this file concurrently would stop each other's timers.
      // Excluded here rather than skipped at runtime, so a failure stays a failure.
      testIgnore: /baby-lane\.spec\.ts/,
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
