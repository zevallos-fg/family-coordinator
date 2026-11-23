import { describe, expect, it } from "vitest";
import { HANDLERS, ToolError, matchDoneCandidates } from "./tools";
import type { UserClient } from "./supabase";

const CHORE = "ef628d35-cda5-425d-8d7b-655c669d3fc7";
const RUN = "9653a3ea-379b-460d-9bba-d85818f7f864";
const TASK = "1395c908-4135-4acf-a1a0-c455a65fc5ce";
const DEC = "11111111-2222-4333-8444-555555555555";

const DUE = [
  { kind: "chore", source_id: CHORE, item: "Empty R2D2 dirty water", due_on: "2026-10-03" },
  { kind: "chore", source_id: RUN, item: "Run R2D2", due_on: "2026-10-07" },
  { kind: "task", source_id: TASK, item: "Fix the Highlander", due_on: "2026-10-03" },
];
const UNDATED = [{ id: DEC, decision: "Install the car seat base" }];

function fakeDb() {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const db = {
    async select(table: string) {
      if (table === "v_whats_due") return DUE;
      if (table === "v_memory_decisions_open") return UNDATED;
      if (table === "families") return [{ timezone: "America/New_York" }];
      if (table === "memory_decisions")
        return [{ id: DEC, decision: "Install the car seat base", context: null, owner_user_id: null }];
      return [];
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn === "fn_chore_done")
        return [{ item: "Empty R2D2 dirty water", done_on: args.p_done_on, next_due_at: "2026-12-07" }];
      return [{ title: "Fix the Highlander", completed_at: "2026-11-23T17:30:00Z" }];
    },
    async insert(table: string, row: Record<string, unknown>) {
      inserts.push({ table, row });
      return { id: "closing-row" };
    },
  } as unknown as UserClient;
  return { db, rpcs, inserts };
}

const call = (db: UserClient, args: Record<string, unknown>) => HANDLERS.mark_done(db, "u1", "f1", args);
const AT = "2026-11-23T12:24:00-05:00";

describe("matchDoneCandidates", () => {
  const pool = DUE.map((r) => ({ id: r.source_id, kind: r.kind as "chore", item: r.item, due_on: r.due_on }));
  it("needs every word, ignores case and punctuation", () => {
    expect(matchDoneCandidates("r2d2 DIRTY water!", pool).map((c) => c.id)).toEqual([CHORE]);
    expect(matchDoneCandidates("R2D2", pool)).toHaveLength(2);
    expect(matchDoneCandidates("clean water", pool)).toHaveLength(0);
  });
  it("an exact name wins over a looser match", () => {
    expect(matchDoneCandidates("run r2d2", pool).map((c) => c.id)).toEqual([RUN]);
  });
});

describe("mark_done", () => {
  it("ticks a chore with the family's local date of done_at", async () => {
    const { db, rpcs } = fakeDb();
    // 03:30 on the 23rd UTC is still the 22nd in Miami.
    const r = (await call(db, { item: "dirty water", done_at: "2026-11-23T03:30:00Z" })) as Record<string, unknown>;
    expect(rpcs).toEqual([{ fn: "fn_chore_done", args: { p_chore_id: CHORE, p_done_on: "2026-11-22" } }]);
    expect(r).toMatchObject({ done: "chore", next_due_on: "2026-12-07" });
  });

  it("ticks a task by id through fn_task_done", async () => {
    const { db, rpcs } = fakeDb();
    const r = (await call(db, { id: TASK, done_at: AT })) as Record<string, unknown>;
    expect(rpcs[0]).toEqual({ fn: "fn_task_done", args: { p_task_id: TASK } });
    expect(r).toMatchObject({ done: "task", item: "Fix the Highlander" });
  });

  it("closes a decision append-only, with a superseding done row", async () => {
    const { db, rpcs, inserts } = fakeDb();
    const r = (await call(db, { item: "car seat", done_at: AT })) as Record<string, unknown>;
    expect(rpcs).toHaveLength(0);
    expect(inserts[0].table).toBe("memory_decisions");
    expect(inserts[0].row).toMatchObject({
      lifecycle_state: "done",
      supersedes_decision_id: DEC,
      lifecycle_at: new Date(AT).toISOString(),
      written_by: "claude_chat",
    });
    expect(r).toMatchObject({ done: "decision", closed_by: "closing-row" });
  });

  it("changes nothing and returns the choices when the name is ambiguous", async () => {
    const { db, rpcs, inserts } = fakeDb();
    const r = (await call(db, { item: "R2D2", done_at: AT })) as { changed: boolean; matches: unknown[] };
    expect(r.changed).toBe(false);
    expect(r.matches).toHaveLength(2);
    expect(rpcs).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("refuses: no match, no done_at, future time, non-uuid id", async () => {
    const { db } = fakeDb();
    await expect(call(db, { item: "mow the lawn", done_at: AT })).rejects.toThrow(ToolError);
    await expect(call(db, { item: "dirty water" })).rejects.toThrow(/done_at is required/);
    await expect(call(db, { item: "dirty water", done_at: "2099-01-01T00:00:00Z" })).rejects.toThrow(/future/);
    await expect(call(db, { id: "x' or 1=1", done_at: AT })).rejects.toThrow(/uuid/);
  });
});
