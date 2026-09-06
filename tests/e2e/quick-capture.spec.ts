import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, fixtureFamilyId } from "./helpers/fixture";

/**
 * The mic in the bottom bar has one job: get you talking.
 *
 * Headless browsers ship no SpeechRecognition, so these install a stub before any
 * app code runs and assert on what the app asks it to do. The stub is a test
 * double for a browser API, not a loosened assertion — start() either gets called
 * without a second tap or it does not.
 */
test.describe.configure({ mode: "serial" });

// The bottom bar is mobile-only (sm:hidden), so pin a phone viewport in both projects.
test.use({ viewport: { width: 390, height: 844 } });

const SPEECH_STUB = `
  window.__speech = { starts: 0, instances: 0 };
  class FakeRecognition {
    constructor() { window.__speech.instances++; }
    start() {
      window.__speech.starts++;
      this.onstart && this.onstart();
      window.__speech.emit = (text) => {
        this.onresult && this.onresult({ results: [[{ transcript: text }]] });
        this.onend && this.onend();
      };
    }
    stop() { this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
`;

let admin: SupabaseClient;
let familyId: string;

function captureText(projectName: string) {
  return `E2E quick capture (${projectName})`;
}

test.beforeAll(async () => {
  admin = adminClient();
  familyId = fixtureFamilyId();
});

test.beforeEach(async ({ page }, testInfo) => {
  await admin
    .from("captures")
    .delete()
    .eq("family_id", familyId)
    .eq("text", captureText(testInfo.project.name));
  await page.addInitScript(SPEECH_STUB);
});

test.afterAll(async ({}, testInfo) => {
  await admin
    .from("captures")
    .delete()
    .eq("family_id", familyId)
    .eq("text", captureText(testInfo.project.name));
});

test("the nav mic opens a sheet without leaving the page", async ({ page }) => {
  await page.goto("/now");
  await page.getByTestId("nav-capture").click();

  await expect(page.getByTestId("quick-capture")).toBeVisible();
  // The old behaviour was a link to /capture. A navigation here is the regression.
  expect(new URL(page.url()).pathname).toBe("/now");
});

test("recording is already live — one tap from anywhere to talking", async ({
  page,
}) => {
  await page.goto("/now");
  await page.getByTestId("nav-capture").click();
  await expect(page.getByTestId("quick-capture")).toBeVisible();

  // No second tap between the nav mic and a live recogniser.
  await expect
    .poll(() => page.evaluate(() => (window as never as { __speech: { starts: number } }).__speech.starts))
    .toBe(1);
  await expect(page.getByTestId("voice-button")).toHaveAttribute(
    "data-recording",
    "true"
  );
});

test("a spoken phrase lands in the box and saves", async ({ page }, testInfo) => {
  const phrase = captureText(testInfo.project.name);

  await page.goto("/now");
  await page.getByTestId("nav-capture").click();
  await expect(page.getByTestId("quick-capture")).toBeVisible();

  await page.evaluate(
    (text) =>
      (window as never as { __speech: { emit: (t: string) => void } }).__speech.emit(text),
    phrase
  );
  await expect(page.getByRole("textbox")).toHaveValue(phrase);

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("quick-capture")).toHaveCount(0, { timeout: 30_000 });

  const { data } = await admin
    .from("captures")
    .select("id, voice_transcription")
    .eq("family_id", familyId)
    .eq("text", phrase);
  expect(data).toHaveLength(1);
  // The transcript came from the microphone, and the row has to say so.
  expect(data![0].voice_transcription).toBe(true);
});

test("the browsing route is untouched and still reachable from the sheet", async ({
  page,
}) => {
  await page.goto("/now");
  await page.getByTestId("nav-capture").click();
  await page.getByRole("link", { name: "Browse captures" }).click();

  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole("heading", { name: "Capture" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ New" })).toBeVisible();
});
