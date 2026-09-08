import { test, expect, type Browser } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin as adminClient, fixtureFamilyId } from "./helpers/fixture";

/**
 * The baby lane, driven end to end against the fixture family.
 *
 * Contractions are family-scoped and carry no name to namespace, and
 * `fn_baby_toggle` closes whichever row of a type is open — so two projects
 * running this file at once would stop each other's timers. playwright.config.ts
 * therefore runs this file in chromium only; nothing here is skipped at runtime.
 */
test.describe.configure({ mode: "serial" });

let admin: SupabaseClient;
let familyId: string;

const KID_NAME = "E2E Baby (chromium)";

async function wipe() {
  await admin.from("baby_events").delete().eq("family_id", familyId);
  // Only the baby lane's links. A family-wide delete here also took out the
  // caregiver share links that caregiver-share.spec.ts had just minted, which
  // showed up as an intermittent failure over there rather than here.
  // shift_id is the clean discriminator: a baby link never carries one, and a
  // caregiver link always does — the CHECK constraint guarantees both halves.
  await admin
    .from("baby_share_links")
    .delete()
    .eq("family_id", familyId)
    .is("shift_id", null);
  await admin.from("kids").delete().eq("family_id", familyId).eq("name", KID_NAME);
}

test.beforeAll(async () => {
  admin = adminClient();
  familyId = fixtureFamilyId();
});

test.beforeEach(async () => {
  await wipe();
});

test.afterAll(async () => {
  await wipe();
});

test("the baby button is on /now before any scrolling, and goes to the lane", async ({
  page,
}) => {
  await page.goto("/now");

  const button = page.getByTestId("baby-open");
  await expect(button).toBeVisible();

  // "Above the fold" is the requirement, so assert the geometry, not just presence.
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThan(viewport!.height);

  await button.click();
  // A route, not a sheet. Deep-linkable, survives dismissal, and lets a launcher
  // long-press land straight on a timer.
  await expect(page).toHaveURL(/\/baby$/);
  await expect(page.getByTestId("baby-card-feed")).toBeVisible();
  await expect(page.getByTestId("baby-card-contraction")).toBeVisible();
});

test("the contraction timer starts and stops with no child record at all", async ({
  page,
}) => {
  const { count } = await admin
    .from("kids")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId);
  expect(count, "this test is about the state before the baby exists").toBe(0);

  await page.goto("/baby/contractions");

  const toggle = page.getByTestId("contraction-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const open = await admin
    .from("baby_events")
    .select("id, kid_id, started_at, ended_at")
    .eq("family_id", familyId)
    .eq("event_type", "contraction");
  expect(open.data).toHaveLength(1);
  expect(open.data![0].kid_id).toBeNull();
  expect(open.data![0].ended_at).toBeNull();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  const closed = await admin
    .from("baby_events")
    .select("id, ended_at")
    .eq("family_id", familyId)
    .eq("event_type", "contraction");
  expect(closed.data).toHaveLength(1);
  expect(closed.data![0].ended_at).not.toBeNull();
});

test("a running contraction survives a full page reload", async ({ page }) => {
  await page.goto("/baby/contractions");
  await page.getByTestId("contraction-toggle").click();
  await expect(page.getByTestId("contraction-toggle")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // Closing the app is the case that matters. Local state cannot survive it;
  // ended_at IS NULL has to be what the UI reads back.
  await page.reload();
  await expect(page.getByTestId("contraction-toggle")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // And it is still visibly running from the index and from /now, because
  // ended_at IS NULL is the source of truth rather than anything in this tab.
  await page.goto("/baby");
  await expect(page.getByTestId("baby-card-contraction")).toHaveAttribute(
    "data-running",
    "true"
  );
  await page.goto("/now");
  await expect(page.getByTestId("baby-open")).toContainText("Contraction running");
});

test("each page explains itself and writes nothing while there is no child record", async ({
  page,
}) => {
  await page.goto("/baby/feed");
  await expect(page.getByTestId("baby-blocked")).toBeVisible();
  await expect(page.getByTestId("nursing-L")).toBeDisabled();
  await expect(page.getByTestId("nursing-R")).toBeDisabled();

  await page.goto("/baby/diaper");
  await expect(page.getByTestId("baby-blocked")).toBeVisible();
  for (const contents of ["pee", "poo", "both", "dry"]) {
    await expect(page.getByTestId(`diaper-${contents}`)).toBeDisabled();
  }

  await page.goto("/baby/sleep");
  await expect(page.getByTestId("baby-blocked")).toBeVisible();
  await expect(page.getByTestId("sleep-toggle")).toBeDisabled();

  const { count } = await admin
    .from("baby_events")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId);
  expect(count).toBe(0);
});

test("one tap logs a diaper and one tap starts a feed once the baby exists", async ({
  page,
}) => {
  const { data: kid, error } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: KID_NAME, birth_date: "2026-09-01" })
    .select("id")
    .single();
  expect(error).toBeNull();

  await page.goto("/baby/diaper");
  await expect(page.getByTestId("baby-blocked")).toHaveCount(0);

  // One tap logs. Nothing is asked before it.
  await page.getByTestId("diaper-pee").click();

  const diapers = await admin
    .from("baby_events")
    .select("id, kid_id, payload")
    .eq("family_id", familyId)
    .eq("event_type", "diaper");
  expect(diapers.data).toHaveLength(1);
  expect(diapers.data![0].kid_id).toBe(kid!.id);
  expect((diapers.data![0].payload as { contents?: string }).contents).toBe("pee");

  // Detail is offered only AFTER, and only where it makes sense: a wet-only
  // change is never asked about poo consistency.
  await expect(page.getByTestId("chip-pee_amount-medium")).toBeVisible();
  await expect(page.getByTestId("chip-consistency-loose")).toHaveCount(0);

  await page.getByTestId("chip-pee_amount-medium").click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("baby_events")
        .select("payload")
        .eq("family_id", familyId)
        .eq("event_type", "diaper");
      return (data?.[0]?.payload as { pee_amount?: string })?.pee_amount ?? null;
    })
    .toBe("medium");

  // Sleep is a timer, on its own page, and one tap starts it.
  await page.goto("/baby/sleep");
  const sleep = page.getByTestId("sleep-toggle");
  await sleep.click();
  await expect(sleep).toHaveAttribute("data-running", "true");
  await sleep.click();
  await expect(sleep).toHaveAttribute("data-running", "false");

  const sleeps = await admin
    .from("baby_events")
    .select("id, ended_at")
    .eq("family_id", familyId)
    .eq("event_type", "sleep");
  expect(sleeps.data).toHaveLength(1);
  expect(sleeps.data![0].ended_at).not.toBeNull();
});

test("a share link reads anonymously, shows its URL once, and dies on revoke", async ({
  page,
  browser,
}: {
  page: import("@playwright/test").Page;
  browser: Browser;
}) => {
  // One contraction to read back through the link.
  await page.goto("/baby/contractions");
  await page.getByTestId("contraction-toggle").click();
  await page.getByTestId("contraction-toggle").click();

  // Share links live on the lane's index.
  await page.goto("/baby");
  await page.getByPlaceholder("Who is this for?").fill("E2E Midwife");
  await page.getByRole("button", { name: "Create link" }).click();

  const urlBox = page.getByTestId("fresh-share-url");
  await expect(urlBox).toBeVisible();
  const shareUrl = (await urlBox.locator("p.font-mono").innerText()).trim();
  expect(shareUrl).toContain("/share/");

  // No session, no cookies — the way a midwife would open it.
  const anon = await browser.newContext({ storageState: undefined });
  const anonPage = await anon.newPage();
  await anonPage.goto(shareUrl);
  await expect(anonPage.getByRole("heading", { name: "Contractions" })).toBeVisible();
  await expect(anonPage.getByText("E2E Midwife")).toBeVisible();
  // A public page must carry no app shell and no way into the family's data.
  await expect(anonPage.getByRole("navigation")).toHaveCount(0);

  // Scoped to the share box. Unscoped this once matched a second button, back
  // when the lane opened over /now and a chore row labelled "Mark <item> done"
  // also answered to "Done". The scope stays regardless of the route move.
  await page.getByTestId("fresh-share-url").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("fresh-share-url")).toHaveCount(0);
  await expect(page.getByText(shareUrl)).toHaveCount(0);

  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);

  await anonPage.reload();
  await expect(anonPage.getByText("This link isn't available")).toBeVisible();
  await anon.close();
});

test("nursing records two ordered segments in one session, and suggests the other side next", async ({
  page,
}) => {
  const { data: kid, error } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: KID_NAME, birth_date: "2026-09-01" })
    .select("id")
    .single();
  expect(error).toBeNull();

  await page.goto("/baby/feed");

  // With no history, a first feed has to start somewhere, and the badge says where.
  await expect(page.getByTestId("nursing-suggested-L")).toBeVisible();

  const left = page.getByTestId("nursing-L");
  const right = page.getByTestId("nursing-R");

  await right.click();
  await expect(right).toHaveAttribute("data-running", "true");

  // Starting the other side stops the first in one step: a baby is not on both.
  await left.click();
  await expect(left).toHaveAttribute("data-running", "true");
  await expect(right).toHaveAttribute("data-running", "false");

  await page.getByTestId("nursing-done").click();
  await expect(page.getByTestId("nursing-done")).toHaveCount(0);

  // One row, not two, and the segments are in the order they happened.
  const feeds = await admin
    .from("baby_events")
    .select("id, kid_id, ended_at, payload")
    .eq("family_id", familyId)
    .eq("event_type", "feed");
  expect(feeds.error).toBeNull();
  expect(feeds.data).toHaveLength(1);

  const row = feeds.data![0];
  expect(row.kid_id).toBe(kid!.id);
  expect(row.ended_at).not.toBeNull();

  const payload = row.payload as {
    segments?: Array<{ side: string; seconds: number }>;
    last_side?: string;
    running?: unknown;
    method?: string;
  };
  expect(payload.method).toBe("breast");
  expect(payload.segments?.map((s) => s.side)).toEqual(["R", "L"]);
  // Nothing may be left running on a finished session, or the page reopens with
  // a clock that never stops.
  expect(payload.running ?? null).toBeNull();
  expect(payload.last_side).toBe("L");

  // Next session starts on the opposite side to the one that finished last.
  await page.reload();
  await expect(page.getByTestId("nursing-suggested-R")).toBeVisible();
});

test("a nursing session in progress survives the app closing", async ({ page }) => {
  const { error } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: KID_NAME, birth_date: "2026-09-01" });
  expect(error).toBeNull();

  await page.goto("/baby/feed");
  await page.getByTestId("nursing-L").click();
  await expect(page.getByTestId("nursing-L")).toHaveAttribute("data-running", "true");

  // The clock lives in the row's payload, not in a setInterval that dies with
  // the tab. A full reload is the closest a test gets to closing the app.
  await page.reload();
  await expect(page.getByTestId("nursing-L")).toHaveAttribute("data-running", "true");
  await expect(page.getByTestId("nursing-done")).toBeVisible();

  // ...and the index shows it running too, from a cold load.
  await page.goto("/baby");
  await expect(page.getByTestId("baby-card-feed")).toHaveAttribute("data-running", "true");
});

test("a start time can be corrected while the timer is still running", async ({ page }) => {
  const { error } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: KID_NAME, birth_date: "2026-09-01" });
  expect(error).toBeNull();

  await page.goto("/baby/sleep");
  await page.getByTestId("sleep-toggle").click();
  await expect(page.getByTestId("sleep-toggle")).toHaveAttribute("data-running", "true");

  const before = await admin
    .from("baby_events")
    .select("id, started_at, ended_at")
    .eq("family_id", familyId)
    .eq("event_type", "sleep");
  expect(before.data).toHaveLength(1);
  const row = before.data![0];

  // Correcting a start must never require stopping first: the nap began before
  // anyone got to the phone, and the timer is still counting.
  await page.getByTestId(`recent-row-${row.id}`).click();
  const startField = page.getByTestId("edit-started-at");
  const corrected = new Date(new Date(row.started_at).getTime() - 40 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await startField.fill(
    `${corrected.getFullYear()}-${pad(corrected.getMonth() + 1)}-${pad(corrected.getDate())}` +
      `T${pad(corrected.getHours())}:${pad(corrected.getMinutes())}`
  );
  await startField.blur();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("baby_events")
        .select("started_at, ended_at")
        .eq("id", row.id)
        .single();
      return data ? `${new Date(data.started_at).getTime()}|${data.ended_at}` : null;
    })
    .toBe(`${corrected.setSeconds(0, 0)}|null`);

  // Still running, on the page and on the dashboard.
  await expect(page.getByTestId("sleep-toggle")).toHaveAttribute("data-running", "true");
  await page.goto("/baby");
  await expect(page.getByTestId("baby-card-sleep")).toHaveAttribute("data-running", "true");
});

test("deleting an entry and undoing it restores the row with its payload", async ({ page }) => {
  const { error } = await admin
    .from("kids")
    .insert({ family_id: familyId, name: KID_NAME, birth_date: "2026-09-01" });
  expect(error).toBeNull();

  await page.goto("/baby/diaper");
  await page.getByTestId("diaper-poo").click();
  await page.getByTestId("chip-consistency-loose").click();

  const before = await admin
    .from("baby_events")
    .select("id, payload")
    .eq("family_id", familyId)
    .eq("event_type", "diaper");
  expect(before.data).toHaveLength(1);
  const original = before.data![0];
  expect((original.payload as { consistency?: string }).consistency).toBe("loose");

  await page.getByTestId(`recent-row-${original.id}`).click();
  await page.getByTestId("edit-delete").click();

  await expect
    .poll(async () => {
      const { count } = await admin
        .from("baby_events")
        .select("id", { count: "exact", head: true })
        .eq("family_id", familyId)
        .eq("event_type", "diaper");
      return count;
    })
    .toBe(0);

  // The undo toast has 8 seconds. What comes back has to be the row, not a
  // reconstruction of it — the detail added after the fact is the part that
  // would be silently lost.
  await page.getByRole("button", { name: /undo/i }).click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("baby_events")
        .select("id, payload")
        .eq("family_id", familyId)
        .eq("event_type", "diaper");
      const row = data?.[0];
      if (!row) return null;
      const p = row.payload as { contents?: string; consistency?: string };
      return `${p.contents}|${p.consistency}`;
    })
    .toBe("poo|loose");
});
