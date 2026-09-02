import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, TEST_CONTEXT } from "../global-setup";

export function admin(): SupabaseClient {
  return adminClient();
}

export function fixtureFamilyId(): string {
  return JSON.parse(fs.readFileSync(TEST_CONTEXT, "utf8")).familyId as string;
}

// Both projects run the same spec files at the same time against the one fixture
// family, so every seeded row carries its project in the name and each project
// only ever deletes its own. Nothing here can address the real household.
export function ns(projectName: string, label: string) {
  return `E2E ${label} (${projectName})`;
}

export function nsPattern(projectName: string, label: string) {
  return `E2E ${label}%(${projectName})`;
}
