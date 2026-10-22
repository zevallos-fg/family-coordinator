import { describe, expect, it, vi } from "vitest";
import { HANDLERS, ToolError } from "./tools";
import type { UserClient } from "./supabase";

const KIDS = [{ id: "e", name: "Evaluna", birth_date: "2026-09-30" }];

function db(events: unknown[] = [], notes: unknown[] = []) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    async insert(table: string, row: Record<string, unknown>) {
      inserts.push({ table, row });
      return { id: `row${inserts.length}` };
    },
    async select(table: string, query: string) {
      if (table === "kids") return KIDS;
      if (table === "families") return [{ timezone: "America/New_York" }];
      if (table === "baby_events") return query.includes("event_type=eq.note") ? notes : events;
      return [];
    },
  } as unknown as UserClient;
  return { client, inserts };
}

describe("settling from chat", () => {
  it("log_sleep keeps settling with the sleep; what worked defaults to the last thing tried", async () => {
    const { client, inserts } = db();
    await HANDLERS.log_sleep(client, "u", "fam", {
      kid: "Evaluna",
      settle_started_at: "2026-10-22T08:22:00-04:00",
      started_at: "2026-10-22T08:50:00-04:00",
      ended_at: "2026-10-22T09:40:00-04:00",
      tried: ["breastfeed", "rock", "walk"],
      mood: "fussy",
    });
    expect(inserts[0].row).toMatchObject({
      event_type: "sleep",
      payload: { settle_started_at: "2026-10-22T12:22:00.000Z", tried: ["breastfeed", "rock", "walk"], worked: "walk", mood: "fussy" },
    });
  });
  it("refuses settling that starts after sleep, and unknown methods", async () => {
    const { client, inserts } = db();
    const base = { kid: "Evaluna", started_at: "2026-10-22T08:50:00-04:00", ended_at: "2026-10-22T09:40:00-04:00" };
    await expect(HANDLERS.log_sleep(client, "u", "fam", { ...base, settle_started_at: "2026-10-22T09:00:00-04:00" })).rejects.toBeInstanceOf(ToolError);
    await expect(HANDLERS.log_sleep(client, "u", "fam", { ...base, tried: ["bounce"] })).rejects.toBeInstanceOf(ToolError);
    expect(inserts).toHaveLength(0);
  });
  it("log_settle_attempt records a stopped attempt", async () => {
    const { client, inserts } = db();
    await HANDLERS.log_settle_attempt(client, "u", "fam", {
      kid: "Evaluna",
      started_at: "2026-10-22T10:30:00-04:00",
      ended_at: "2026-10-22T10:45:00-04:00",
      tried: ["pat"],
      mood: "crying",
    });
    expect(inserts[0].row).toMatchObject({ event_type: "settle", payload: { outcome: "stopped", mood: "crying", tried: [{ method: "pat" }] } });
  });
  it("sleep_patterns reads naps in the family's zone and includes the reference notes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T16:00:00Z")); // noon in New York
    try {
      const events = [
        { id: "n", event_type: "sleep", started_at: "2026-10-22T06:00:00Z", ended_at: "2026-10-22T11:32:00Z", payload: {} },
        {
          id: "c",
          event_type: "sleep",
          started_at: "2026-10-22T12:50:00Z",
          ended_at: "2026-10-22T13:40:00Z",
          payload: { settle_started_at: "2026-10-22T12:22:00Z", tried: ["breastfeed", "walk"], worked: "walk", mood: "fussy" },
        },
      ];
      const notes = [{ payload: { category: "Sleep", text: "Build sleep pressure according to age appropriate windows", position: 2, source: "Leo's sleep log" } }];
      const { client } = db(events, notes);
      const out = (await HANDLERS.sleep_patterns(client, "u", "fam", { kid: "Evaluna", days: 7 })) as {
        sleeps: Array<{ nap: string; asleep: string; awake_before_min: number | null; minutes_to_settle: number | null; worked: string | null }>;
        reference_notes: Array<{ text: string }>;
        by_method: Array<{ method: string; worked: number }>;
      };
      expect(out.reference_notes[0].text).toMatch(/sleep pressure/);
      expect(out.sleeps.map((x) => x.nap)).toEqual(["Night", "Nap 1"]);
      expect(out.sleeps[1]).toMatchObject({ asleep: "8:50 AM", awake_before_min: 50, minutes_to_settle: 28, worked: "Walk" });
      expect(out.by_method.find((m) => m.method === "Walk")?.worked).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
