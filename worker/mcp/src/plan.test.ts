import { describe, expect, it } from "vitest";
import { HANDLERS, ToolError } from "./tools";
import { NEWBORN_VISIT } from "../../../lib/plan/templates";
import type { UserClient } from "./supabase";

function fakeDb(kids: Array<{ id: string; name: string; birth_date: string | null }>, events: Array<{ id: string }> = []) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    async insert(table: string, row: Record<string, unknown>) {
      inserts.push({ table, row });
      return { id: table === "family_events" ? "ev1" : `row${inserts.length}` };
    },
    async select(table: string) {
      return table === "kids" ? kids : events;
    },
  } as unknown as UserClient;
  return { db, inserts };
}

describe("connector Plan tools", () => {
  it("add_event books it and seeds the same sourced checklist the app would", async () => {
    const { db, inserts } = fakeDb([{ id: "k", name: "Evaluna", birth_date: "2026-09-30" }]);
    const out = (await HANDLERS.add_event(db, "u", "f", {
      kid: "Evaluna",
      title: "1-month checkup",
      kind: "medical",
      starts_at: "2026-10-07T14:40:00-04:00",
    })) as { items: number; checklist: string };
    expect(inserts[0]).toMatchObject({ table: "family_events", row: { kid_id: "k", written_by: "claude_chat", starts_at: "2026-10-07T18:40:00.000Z" } });
    const items = inserts.filter((i) => i.table === "event_items");
    expect(items.map((i) => i.row.template_key)).toEqual(NEWBORN_VISIT.map((t) => t.key));
    expect(items.every((i) => i.row.written_by === "claude_chat" && String(i.row.source_url).startsWith("https://"))).toBe(true);
    expect(out.items).toBe(NEWBORN_VISIT.length);
  });

  it("add_event refuses a missing time rather than inventing one", async () => {
    const { db } = fakeDb([]);
    await expect(HANDLERS.add_event(db, "u", "f", { title: "x", kind: "medical" })).rejects.toBeInstanceOf(ToolError);
  });

  it("add_event_item refuses a non-https source and an event outside the family", async () => {
    const ok = fakeDb([], [{ id: "ev1" }]);
    await expect(
      HANDLERS.add_event_item(ok.db, "u", "f", { event_id: "ev1", kind: "question", text: "q", source_url: "http://x.org" })
    ).rejects.toBeInstanceOf(ToolError);
    const none = fakeDb([], []);
    await expect(HANDLERS.add_event_item(none.db, "u", "f", { event_id: "nope", kind: "question", text: "q" })).rejects.toBeInstanceOf(
      ToolError
    );
  });
});
