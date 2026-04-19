import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Stub Next.js server APIs not available in test environment
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("posthog-node", () => {
  class PostHog {
    capture = vi.fn();
    shutdown = vi.fn().mockResolvedValue(undefined);
  }
  return { PostHog };
});

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe("T1 smoke: database contract", () => {
  it("fn_user_in_family exists and returns false when no auth context", async () => {
    const admin = createClient<Database>(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.rpc("fn_user_in_family", {
      target_family_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("fn_skill_get_monthly_spend rejects anonymous callers", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { error } = await anon.rpc("fn_skill_get_monthly_spend", {
      target_family_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("fn_skill_record_usage rejects anonymous callers", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { error } = await anon.rpc("fn_skill_record_usage", {
      target_family_id: "00000000-0000-4000-8000-000000000000",
      target_user_id: "00000000-0000-4000-8000-000000000000",
      p_skill_name: "test",
      p_model: "claude-haiku-4-5-20251001",
      p_input_tokens: 10,
      p_output_tokens: 10,
      p_cost_cents: 0.01,
    });
    expect(error).not.toBeNull();
  });

  it("anon cannot read families table without session", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { data } = await anon.from("families").select("*");
    expect(data).toEqual([]);
  });

  it("anon cannot insert into api_usage directly (RLS)", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { error } = await anon.from("api_usage").insert({
      family_id: "00000000-0000-4000-8000-000000000000",
      skill_name: "test",
      model: "test",
    });
    expect(error).not.toBeNull();
  });
});

describe("T1 smoke: skill framework", () => {
  it("family-capture-router exports run function with correct shape", async () => {
    const mod = await import("@/skills/family-capture-router");
    expect(typeof mod.run).toBe("function");
  });

  it("family-capture-router returns invalid_input on empty text", async () => {
    const mod = await import("@/skills/family-capture-router");
    const result = await mod.run(
      { text: "", categories: [] },
      {
        familyId: "00000000-0000-4000-8000-000000000000",
        userId: "00000000-0000-4000-8000-000000000000",
      }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });
});

describe("T2 smoke: new skill contracts", () => {
  it("family-schedule-reconciler exports run function", async () => {
    const mod = await import("@/skills/family-schedule-reconciler");
    expect(typeof mod.run).toBe("function");
  });

  it("family-schedule-reconciler rejects empty imageBase64", async () => {
    const mod = await import("@/skills/family-schedule-reconciler");
    const result = await mod.run(
      {
        imageBase64: "",
        imageMimeType: "image/jpeg",
        weekOf: "2025-03-03",
        knownNames: ["Fernando", "Yenny"],
      },
      {
        familyId: "00000000-0000-4000-8000-000000000000",
        userId: "00000000-0000-4000-8000-000000000000",
      }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("family-grocery-parser exports run function", async () => {
    const mod = await import("@/skills/family-grocery-parser");
    expect(typeof mod.run).toBe("function");
  });

  it("family-grocery-parser rejects empty text", async () => {
    const mod = await import("@/skills/family-grocery-parser");
    const result = await mod.run(
      { text: "", stores: [] },
      {
        familyId: "00000000-0000-4000-8000-000000000000",
        userId: "00000000-0000-4000-8000-000000000000",
      }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("anon cannot read captures table without session (RLS)", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { data } = await anon.from("captures").select("*");
    expect(data).toEqual([]);
  });

  it("anon cannot read grocery_items table without session (RLS)", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { data } = await anon.from("grocery_items").select("*");
    expect(data).toEqual([]);
  });

  it("anon cannot read schedule_entries table without session (RLS)", async () => {
    const anon = createClient<Database>(URL, ANON);
    const { data } = await anon.from("schedule_entries").select("*");
    expect(data).toEqual([]);
  });
});
