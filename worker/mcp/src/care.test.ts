import { describe, expect, it } from "vitest";
import { HANDLERS, ToolError } from "./tools";
import type { UserClient } from "./supabase";

function fakeDb(selects: Record<string, unknown[]>) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    async insert(table: string, row: Record<string, unknown>) {
      inserts.push({ table, row });
      return { id: `row${inserts.length}` };
    },
    async select(table: string) {
      return selects[table] ?? [];
    },
  } as unknown as UserClient;
  return { db, inserts };
}
const USERS = [
  { id: "y", full_name: "Yenny Marino" },
  { id: "f", full_name: "Fernando Zevallos" },
];

describe("connector care tools", () => {
  it("log_bp by first name returns the published action for a severe reading", async () => {
    const { db, inserts } = fakeDb({ users: USERS });
    const out = (await HANDLERS.log_bp(db, "u", "fam", { person: "Yenny", systolic: 162, diastolic: 100, taken_at: "2026-10-05T20:00:00-04:00" })) as { band: string; action: string };
    expect(inserts[0]).toMatchObject({ table: "care_logs", row: { person_user_id: "y", kind: "bp", written_by: "claude_chat", payload: { systolic: 162, diastolic: 100 } } });
    expect(out.band).toBe("160/110 or higher");
    expect(out.action).toMatch(/right away/);
  });
  it("log_bp refuses an implausible reading and a missing time", async () => {
    const { db } = fakeDb({ users: USERS });
    await expect(HANDLERS.log_bp(db, "u", "fam", { person: "Yenny", systolic: 80, diastolic: 120, taken_at: "2026-10-05T20:00:00-04:00" })).rejects.toBeInstanceOf(ToolError);
    await expect(HANDLERS.log_bp(db, "u", "fam", { person: "Yenny", systolic: 120, diastolic: 80 })).rejects.toBeInstanceOf(ToolError);
  });
  it("log_checkin keeps only known answers and returns warnings using the latest BP", async () => {
    const { db, inserts } = fakeDb({ users: USERS, care_logs: [{ payload: { systolic: 145, diastolic: 85 } }] });
    const out = (await HANDLERS.log_checkin(db, "u", "fam", { person: "yenny", at: "2026-10-05T20:00:00-04:00", headache: 6, junk: "x" })) as { warnings: Array<{ level: string }> };
    expect(inserts[0].row.payload).toEqual({ headache: 6 });
    expect(out.warnings.some((w) => w.level === "call")).toBe(true);
  });
  it("log_care_dose needs a tracked medicine", async () => {
    const { db } = fakeDb({ users: USERS, care_medications: [] });
    await expect(HANDLERS.log_care_dose(db, "u", "fam", { person: "Yenny", medicine: "x", taken_at: "2026-10-05T20:00:00-04:00" })).rejects.toBeInstanceOf(ToolError);
  });
});
