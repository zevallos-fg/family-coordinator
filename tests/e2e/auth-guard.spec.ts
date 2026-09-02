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

  test("callback refuses an OTP type the app never initiates", async ({ request }) => {
    // A recovery link is a valid Supabase flow this app never starts. It must be
    // turned away on the type alone, before verifyOtp is reached — hence the
    // distinct error code, which a merely-invalid token would not produce.
    const res = await request.get(
      "/api/auth/callback?token_hash=any-token&type=recovery",
      { maxRedirects: 0 }
    );
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login?error=auth_type_not_allowed");
  });

  test("callback still accepts magiclink as a type", async ({ request }) => {
    // Same bogus token, allowed type: it gets past the allowlist and fails at
    // verification instead, proving the guard rejects on type and not on token.
    const res = await request.get(
      "/api/auth/callback?token_hash=any-token&type=magiclink",
      { maxRedirects: 0 }
    );
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login?error=auth_failed");
  });
});
