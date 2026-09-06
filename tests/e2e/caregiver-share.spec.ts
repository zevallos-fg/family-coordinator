import { test, expect, type Browser } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, fixtureFamilyId } from "./helpers/fixture";

/**
 * The caregiver share link, end to end.
 *
 * NOT YET RUN. These require migration 20260906_caregiver_share_tokens, which is
 * written and dry-run but not applied — the functions they exercise do not exist
 * in production yet. The SQL half was verified by the dry run (mint, read,
 * submit, and a bad token correctly refused, all rolled back); this is the half
 * that needs the schema to be real. They run the moment the migration lands.
 *
 * The old behaviour these replace: /caregiver-view/<shift uuid>, which 404'd for
 * every caregiver because the anon client cannot see through RLS, and a recap
 * form whose insert RLS refused.
 */
test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let familyId: string;
let tag: string;
let shiftId: string;

test.beforeAll(async ({}, testInfo) => {
  admin = adminClient();
  familyId = fixtureFamilyId();
  tag = `E2E share (${testInfo.project.name})`;
});

test.beforeEach(async () => {
  await wipe();

  const { data: caregiver, error: cgError } = await admin
    .from("caregivers")
    .insert({ family_id: familyId, name: tag, role: "nanny" })
    .select("id")
    .single();
  expect(cgError).toBeNull();

  const { data: shift, error: shiftError } = await admin
    .from("caregiver_shifts")
    .insert({
      family_id: familyId,
      caregiver_id: caregiver!.id,
      start_at: new Date(Date.now() + 3600_000).toISOString(),
      end_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
      kid_names: [tag],
    })
    .select("id")
    .single();
  expect(shiftError).toBeNull();
  shiftId = shift!.id;

  await admin
    .from("shift_briefs")
    .insert({ shift_id: shiftId, content: `${tag} — nap at 1pm, snack at 3pm.` });
});

test.afterAll(async () => {
  await wipe();
});

async function wipe() {
  const { data: shifts } = await admin
    .from("caregiver_shifts")
    .select("id")
    .eq("family_id", familyId);
  for (const s of shifts ?? []) {
    await admin.from("shift_briefs").delete().eq("shift_id", s.id);
    await admin.from("shift_recaps").delete().eq("shift_id", s.id);
  }
  await admin.from("baby_share_links").delete().eq("family_id", familyId);
  await admin.from("caregiver_shifts").delete().eq("family_id", familyId);
  await admin.from("caregivers").delete().eq("family_id", familyId).ilike("name", tag);
}

/** Mint a link through the UI and return the URL it shows exactly once. */
async function mintLink(page: import("@playwright/test").Page): Promise<string> {
  await page.goto(`/caregiver/shifts/${shiftId}`);
  await page.getByRole("button", { name: "Create caregiver link" }).click();
  const box = page.getByTestId("fresh-caregiver-link");
  await expect(box).toBeVisible();
  return (await box.locator("p.font-mono").innerText()).trim();
}

test("a caregiver can open the link and read the brief, with no session", async ({
  page,
  browser,
}: {
  page: import("@playwright/test").Page;
  browser: Browser;
}) => {
  const url = await mintLink(page);
  expect(url, "the token must not be the shift id").not.toContain(shiftId);

  // No cookies, no session — the way a nanny opens it.
  const anon = await browser.newContext({ storageState: undefined });
  const anonPage = await anon.newPage();
  await anonPage.goto(url);

  // The old page 404'd here, every time, for everyone it was written for.
  await expect(anonPage.getByText(tag, { exact: false }).first()).toBeVisible();
  await expect(anonPage.getByText("nap at 1pm")).toBeVisible();
  await expect(anonPage.getByRole("navigation")).toHaveCount(0);
  await anon.close();
});

test("a caregiver can submit a recap, which the family then sees", async ({
  page,
  browser,
}: {
  page: import("@playwright/test").Page;
  browser: Browser;
}) => {
  const url = await mintLink(page);

  const anon = await browser.newContext({ storageState: undefined });
  const anonPage = await anon.newPage();
  await anonPage.goto(url);

  await anonPage.getByRole("textbox").fill("Good day. Ate everything, napped twice.");
  await anonPage.getByRole("button", { name: "Send recap" }).click();
  await expect(anonPage.getByText("Sent!")).toBeVisible();

  const { data } = await admin
    .from("shift_recaps")
    .select("transcription")
    .eq("shift_id", shiftId);
  expect(data).toHaveLength(1);
  expect(data![0].transcription).toContain("napped twice");

  await anon.close();
});

test("the raw shift id is no longer a working link", async ({ browser }) => {
  // The whole point: an identifier stops being a credential.
  const anon = await browser.newContext({ storageState: undefined });
  const anonPage = await anon.newPage();
  await anonPage.goto(`/caregiver-view/${shiftId}`);
  await expect(anonPage.getByText("This link isn't available")).toBeVisible();
  await anon.close();
});

test("the URL is shown once and not again", async ({ page }) => {
  const url = await mintLink(page);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("fresh-caregiver-link")).toHaveCount(0);
  await expect(page.getByText(url)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(url)).toHaveCount(0);
});

test("a revoked link stops working immediately", async ({ page, browser }) => {
  const url = await mintLink(page);
  const token = url.split("/").pop()!;

  const anon = await browser.newContext({ storageState: undefined });
  const anonPage = await anon.newPage();
  await anonPage.goto(url);
  await expect(anonPage.getByText("nap at 1pm")).toBeVisible();

  await admin
    .from("baby_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);

  await anonPage.reload();
  await expect(anonPage.getByText("This link isn't available")).toBeVisible();
  await anon.close();
});

test("an expired link stops working, and says the same thing", async ({
  page,
  browser,
}) => {
  const url = await mintLink(page);
  const token = url.split("/").pop()!;

  await admin
    .from("baby_share_links")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("token", token);

  const anon = await browser.newContext({ storageState: undefined });
  const anonPage = await anon.newPage();
  await anonPage.goto(url);
  // Expired, revoked and never-existed are one sentence on purpose: the page
  // must not confirm which tokens were ever real.
  await expect(anonPage.getByText("This link isn't available")).toBeVisible();
  await anon.close();
});
