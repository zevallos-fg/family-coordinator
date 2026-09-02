import { test, expect } from "@playwright/test";

// The manifest and its icons must be reachable to a browser that has never signed
// in — an install prompt is offered before login.
test.use({ storageState: { cookies: [], origins: [] } });

type Manifest = {
  display: string;
  start_url: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

test.describe("PWA manifest", () => {
  test("/manifest.webmanifest is served as application/manifest+json", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
  });

  test("manifest parses and declares standalone display from /now", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    const manifest = (await res.json()) as Manifest;

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/now");
  });

  test("every icon the manifest advertises actually resolves", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    const manifest = (await res.json()) as Manifest;

    expect(manifest.icons.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), `${icon.src} (${icon.sizes}) should resolve`).toBe(200);
      expect(iconRes.headers()["content-type"], `${icon.src} content-type`).toContain(
        "image/"
      );
    }
  });
});
