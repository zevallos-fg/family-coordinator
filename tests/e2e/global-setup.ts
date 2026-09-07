import { chromium, type FullConfig } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// A dedicated user and family, never the real household. Every authenticated
// spec writes through this family_id, so a runaway test cannot reach real data.
export const TEST_EMAIL = "e2e+fixture@familyco.test";
export const TEST_FAMILY_NAME = "E2E Fixture Family";

const AUTH_DIR = path.join(process.cwd(), "tests", "e2e", ".auth");
export const STORAGE_STATE = path.join(AUTH_DIR, "user.json");
export const TEST_CONTEXT = path.join(AUTH_DIR, "test-context.json");

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "e2e globalSetup needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findOrCreateUser(admin: SupabaseClient): Promise<User> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const existing = data.users.find((u) => u.email === TEST_EMAIL);
  if (existing) return existing;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "E2E Fixture" },
  });
  if (createError) throw createError;
  return created.user;
}

async function findOrCreateFamily(admin: SupabaseClient): Promise<string> {
  const { data: existing, error } = await admin
    .from("families")
    .select("id, name")
    .eq("name", TEST_FAMILY_NAME)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    // Belt and braces: only ever hand back a family carrying the fixture name.
    if (existing.name !== TEST_FAMILY_NAME) {
      throw new Error(`Refusing to use family "${existing.name}" as the test family`);
    }
    return existing.id as string;
  }

  const { data: created, error: insertError } = await admin
    .from("families")
    .insert({ name: TEST_FAMILY_NAME })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id as string;
}

async function ensureUserRow(admin: SupabaseClient, user: User) {
  // family_members.user_id points at public.users, not auth.users. The callback
  // upserts this row on sign-in, but membership has to exist before we sign in,
  // so the fixture seeds it up front.
  const { error } = await admin.from("users").upsert({
    id: user.id,
    email: user.email!,
    full_name: user.user_metadata?.full_name ?? "E2E Fixture",
  });
  if (error) throw error;
}

async function ensureMembership(admin: SupabaseClient, familyId: string, userId: string) {
  const { data: existing } = await admin
    .from("family_members")
    .select("user_id")
    .eq("family_id", familyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin
    .from("family_members")
    .insert({ family_id: familyId, user_id: userId, role: "owner" });
  if (error) throw error;
}

/**
 * Is the thing answering on this URL the build we just made?
 *
 * A stale `next start` left listening on 3000 answers every health check
 * perfectly — `curl /login` returns 200 — while serving code from an hour ago.
 * `reuseExistingServer` then hands the suite to it without a word. That cost a
 * round of wrong conclusions: a fix "didn't work", then a change "broke a test",
 * and both were the squatter.
 *
 * Next serves its static assets under a path containing the build id, so asking
 * for one is a question only the right build can answer. Local URLs only: a run
 * pointed at a deployed preview has no local build to compare against.
 */
async function assertServerIsOurBuild(baseURL: string): Promise<void> {
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);
  if (!isLocal) return;

  const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
  if (!fs.existsSync(buildIdPath)) return; // `next dev`, which has no build id

  const buildId = fs.readFileSync(buildIdPath, "utf8").trim();
  const probe = `${baseURL.replace(/\/$/, "")}/_next/static/${buildId}/_buildManifest.js`;

  let status: number;
  try {
    status = (await fetch(probe)).status;
  } catch (err) {
    throw new Error(
      `Could not reach ${baseURL} to check which build it is serving: ${String(err)}`
    );
  }

  if (status !== 200) {
    throw new Error(
      [
        `The server on ${baseURL} is NOT serving the build in .next.`,
        ``,
        `  expected build id : ${buildId}`,
        `  probe             : ${probe} -> ${status}`,
        ``,
        `Almost certainly a previous \`next start\` still holding the port. It will`,
        `answer every request and pass every health check while serving old code,`,
        `so the results of this run would mean nothing. Kill it and rebuild:`,
        ``,
        `  PowerShell:  Get-NetTCPConnection -LocalPort 3000 -State Listen |`,
        `               ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
        ``,
      ].join("\n")
    );
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://localhost:3000";

  // Before anything else: prove the server under test is the one we built.
  await assertServerIsOurBuild(baseURL);

  const admin = adminClient();

  const user = await findOrCreateUser(admin);
  await ensureUserRow(admin, user);
  const familyId = await findOrCreateFamily(admin);
  await ensureMembership(admin, familyId, user.id);

  // Mint a real magic-link token, then let the app's own callback turn it into
  // cookies. Nothing here forges a session: if /api/auth/callback is broken, the
  // fixture fails and every authenticated spec fails with it — which is the point.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (linkError) throw linkError;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    const target =
      `/api/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}` +
      `&type=magiclink&next=/now`;

    await page.goto(target);
    await page.waitForLoadState("networkidle");

    const landed = new URL(page.url()).pathname;
    if (landed !== "/now") {
      throw new Error(
        `Auth fixture failed: /api/auth/callback landed on "${landed}" instead of /now. ` +
          `A redirect to /login means the token_hash was rejected; /onboarding means the ` +
          `family_members row is missing.`
      );
    }

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE });
    fs.writeFileSync(
      TEST_CONTEXT,
      JSON.stringify({ userId: user.id, familyId, email: TEST_EMAIL }, null, 2)
    );
  } finally {
    await browser.close();
  }
}
