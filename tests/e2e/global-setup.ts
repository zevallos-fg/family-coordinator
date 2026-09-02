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

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://localhost:3000";

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
