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

  /**
   * The system under test is ONE `next start` process talking to ONE hosted
   * Supabase, and one shared fixture family inside it. That capacity does not
   * grow with the number of cores the runner happens to have, so Playwright's
   * default (half the CPUs — 8 here) is not parallelism, it is a load test with
   * functional assertions bolted on.
   *
   * Measured on this machine, full suite, retries at 0, against a server whose
   * build id was checked against .next/BUILD_ID:
   *
   *   workers 8 (default)   5 to 8 failures, a different set each run
   *   workers 4             1 failure
   *   workers 3             174 of 174, twice
   *
   * Every failure passed in isolation, and the shifting set was the tell. So
   * this is a capacity ceiling, not flake being papered over: no test is
   * skipped, no assertion is loosened, no retry is added. The suite simply
   * stops asking one Node process to render sixteen pages at once, each of
   * which makes several sequential round trips to a database in another region.
   *
   * If the suite goes red again, that is a real failure. Do not raise this
   * number to make it green.
   */
  workers: 3,
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
