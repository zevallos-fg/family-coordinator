import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Admin client with service-role key. Bypasses ALL RLS.
 *
 * USE ONLY FOR:
 * - /admin/ops dashboard (T9) reading aggregate api_usage across families
 * - System-level scripts (data migration, seed)
 *
 * NEVER USE FOR:
 * - skillRunner (uses RPC functions instead — see /skills/_lib/runner.ts)
 * - Any user-facing request handler
 * - Any code path that takes user input and queries the DB
 *
 * If you find yourself reaching for this from a user-facing route, stop and
 * ask: can this go through an authenticated client + RLS instead?
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}