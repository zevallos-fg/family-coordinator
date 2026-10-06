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

describe("connector food and movement tools", () => {
  const PROFILE = [{ lactating: true, delivery_type: "cesarean", exercise_cleared_on: null, conditions: ["rheumatoid_arthritis"] }];
  it("log_food needs an explicit estimated flag and refuses bad numbers", async () => {
    const { db, inserts } = fakeDb({ users: USERS });
    const base = { person: "Yenny", name: "Yogurt", eaten_at: "2026-10-05T09:00:00-04:00", nutrients: { protein_g: 17 } };
    await expect(HANDLERS.log_food(db, "u", "fam", base)).rejects.toThrow(/estimated/);
    await expect(HANDLERS.log_food(db, "u", "fam", { ...base, estimated: true, nutrients: { protein_g: -3 } })).rejects.toBeInstanceOf(ToolError);
    await expect(HANDLERS.log_food(db, "u", "fam", { ...base, estimated: true, eaten_at: undefined })).rejects.toBeInstanceOf(ToolError);
    expect(inserts).toHaveLength(0);
  });
  it("log_food marks Claude's numbers as an estimate and returns today against the breastfeeding targets", async () => {
    const { db, inserts } = fakeDb({
      users: USERS,
      families: [{ timezone: "America/New_York" }],
      care_profiles: PROFILE,
      care_logs: [{ at: "2026-10-05T13:00:00Z", payload: { name: "Yogurt", nutrients: { protein_g: 17, fiber_g: 0 } } }],
    });
    const out = (await HANDLERS.log_food(db, "u", "fam", {
      person: "yenny",
      name: "Yogurt",
      eaten_at: "2026-10-05T09:00:00-04:00",
      nutrients: { protein_g: 17, fiber_g: 0, made_up: 4 },
      estimated: true,
    })) as { estimated: boolean; today: Array<{ nutrient: string; target: number | null; percent: number | null }>; still_short: string[] };
    expect(inserts[0]).toMatchObject({ table: "care_logs", row: { kind: "food", person_user_id: "y", written_by: "claude_chat", payload: { estimated: true, source: "claude_estimate", nutrients: { protein_g: 17, fiber_g: 0 } } } });
    expect((inserts[0].row.payload as { nutrients: object }).nutrients).not.toHaveProperty("made_up");
    expect(out.estimated).toBe(true);
    expect(out.today.find((r) => r.nutrient === "protein_g")).toMatchObject({ target: 71, percent: 24 });
    expect(out.today.find((r) => r.nutrient === "kcal")?.target).toBeNull();
    expect(out.still_short).toEqual(["protein_g", "fiber_g"]);
  });
  it("nutrition_today: no exercise goal after a cesarean until cleared; RA guidance when on file", async () => {
    const { db } = fakeDb({ users: USERS, families: [{ timezone: "America/New_York" }], care_profiles: PROFILE, care_logs: [] });
    const out = (await HANDLERS.nutrition_today(db, "u", "fam", { person: "Yenny", date: "2026-10-05" })) as {
      movement: { weekly_goal: number | null; guidance: string };
      guidance: { rheumatoid_arthritis?: string[] };
    };
    expect(out.movement.weekly_goal).toBeNull();
    expect(out.movement.guidance).toMatch(/ask the OB/);
    expect(out.guidance.rheumatoid_arthritis?.[0]).toMatch(/Strong/);
    await expect(HANDLERS.nutrition_today(db, "u", "fam", { person: "Yenny", date: "Oct 5" })).rejects.toBeInstanceOf(ToolError);
  });
  it("log_activity validates", async () => {
    const { db, inserts } = fakeDb({ users: USERS });
    await expect(HANDLERS.log_activity(db, "u", "fam", { person: "Yenny", activity: "sprint", minutes: 10, at: "2026-10-05T09:00:00-04:00" })).rejects.toBeInstanceOf(ToolError);
    await expect(HANDLERS.log_activity(db, "u", "fam", { person: "Yenny", activity: "walk", minutes: 0, at: "2026-10-05T09:00:00-04:00" })).rejects.toBeInstanceOf(ToolError);
    await HANDLERS.log_activity(db, "u", "fam", { person: "Yenny", activity: "walk", minutes: 12, at: "2026-10-05T09:00:00-04:00" });
    expect(inserts[0].row).toMatchObject({ kind: "move", payload: { activity: "walk", minutes: 12, source: "claude_chat" } });
  });
  it("set_food_goal refuses an implausible calorie goal and keeps earlier targets", async () => {
    const { db, inserts } = fakeDb({
      users: USERS,
      families: [{ timezone: "America/New_York" }],
      person_nutrition_targets: [{ daily_kcal_target: null, micronutrient_targets: { protein_g: 85 } }],
    });
    await expect(HANDLERS.set_food_goal(db, "u", "fam", { person: "Yenny", kcal: 800 })).rejects.toBeInstanceOf(ToolError);
    await HANDLERS.set_food_goal(db, "u", "fam", { person: "Yenny", kcal: 2400, targets: { fiber_g: 32 }, start_date: "2026-10-05", note: "dietitian" });
    expect(inserts[0]).toMatchObject({
      table: "person_nutrition_targets",
      row: { user_id: "y", start_date: "2026-10-05", daily_kcal_target: 2400, micronutrient_targets: { protein_g: 85, fiber_g: 32 }, notes: "dietitian" },
    });
  });
});

describe("connector expert practice", () => {
  it("nutrition_today attributes Dr. Lyon and Dr. Sims and says where they don't reach", async () => {
    const { db } = fakeDb({
      users: USERS,
      families: [{ timezone: "America/New_York" }],
      care_profiles: [{ lactating: true, delivery_type: "cesarean", exercise_cleared_on: null, conditions: [] }],
      care_logs: [{ at: "2026-10-05T13:00:00Z", payload: { name: "Eggs", meal: "breakfast", nutrients: { protein_g: 31 } } }],
    });
    const out = (await HANDLERS.nutrition_today(db, "u", "fam", { person: "Yenny", date: "2026-10-05" })) as {
      expert_practice: {
        protein_by_meal: Array<{ meal: string; grams: number; reaches_30g: boolean | null }>;
        movement: Array<{ who: string; says: string }>;
        protein_goal_methods: Array<{ who: string; weight: string }>;
        not_applied_here: string[];
      };
    };
    const e = out.expert_practice;
    expect(e.protein_by_meal[0]).toMatchObject({ meal: "breakfast", grams: 31, reaches_30g: true });
    expect(e.movement.find((m) => m.who === "lyon")?.says).toMatch(/doctor/);
    expect(e.protein_goal_methods.find((m) => m.who === "lyon")?.weight).toMatch(/goal weight/);
    expect(e.not_applied_here[0]).toMatch(/breastfeeding/);
  });
});
