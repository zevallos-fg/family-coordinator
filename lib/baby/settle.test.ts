import { describe, expect, it } from "vitest";
import {
  ON_HER_OWN,
  SettleError,
  byMethod,
  byNap,
  defaultWorked,
  fmtMin,
  sleepRows,
  sleepSettleFields,
  toggleTry,
} from "./settle";

// Local times (tests run in America/New_York).
const t = (d: number, hm: string) => new Date(`2026-10-${String(d).padStart(2, "0")}T${hm}:00`).toISOString();
const sleep = (id: string, start: string, end: string | null, payload: object = {}) => ({ id, event_type: "sleep", started_at: start, ended_at: end, payload });
const NOW = Date.parse(t(22, "12:00"));

describe("settling taps", () => {
  it("adds methods in order and takes one back on a second tap", () => {
    let tried = toggleTry([], "breastfeed", t(22, "08:22"));
    tried = toggleTry(tried, "walk", t(22, "08:35"));
    expect(tried.map((x) => x.method)).toEqual(["breastfeed", "walk"]);
    expect(toggleTry(tried, "breastfeed", t(22, "08:40")).map((x) => x.method)).toEqual(["walk"]);
    expect(() => toggleTry([], "bounce", t(22, "08:22"))).toThrow(SettleError);
  });
  it("defaults what worked to the last thing tried, or on her own", () => {
    expect(defaultWorked([])).toBe(ON_HER_OWN);
    expect(defaultWorked([{ method: "breastfeed", at: "" }, { method: "walk", at: "" }])).toBe("walk");
  });
  it("validates the summary a sleep carries", () => {
    expect(sleepSettleFields({ settleStartedAt: t(22, "08:22"), asleepAt: t(22, "08:50"), tried: ["breastfeed", "walk"], worked: "walk", mood: "fussy" })).toEqual({
      settle_started_at: t(22, "08:22"),
      tried: ["breastfeed", "walk"],
      worked: "walk",
      mood: "fussy",
    });
    expect(() => sleepSettleFields({ settleStartedAt: t(22, "09:00"), asleepAt: t(22, "08:50") })).toThrow(/before/);
    expect(() => sleepSettleFields({ asleepAt: t(22, "08:50"), mood: "grumpy" })).toThrow(/mood/);
    expect(() => sleepSettleFields({ asleepAt: t(22, "08:50"), worked: "bounce" })).toThrow(/worked/);
  });
});

describe("Yenny's two first naps", () => {
  // Oct 21: up at 6:00, settling from 7:30 (90 min awake), fussy, asleep 8:05.
  // Oct 22: up at 7:32, fed but wouldn't sleep; settling from 8:22 (50 min awake), asleep 8:50.
  const events = [
    sleep("n21", t(21, "01:00"), t(21, "06:00")),
    sleep("a", t(21, "08:05"), t(21, "09:10"), { settle_started_at: t(21, "07:30"), tried: ["rock", "walk"], worked: "walk", mood: "fussy" }),
    sleep("b", t(21, "11:00"), t(21, "12:30"), { settle_started_at: t(21, "10:50"), tried: ["breastfeed"], worked: "breastfeed", mood: "calm" }),
    sleep("n22", t(22, "02:00"), t(22, "07:32")),
    sleep("c", t(22, "08:50"), t(22, "09:40"), { settle_started_at: t(22, "08:22"), tried: ["breastfeed", "rock", "walk"], worked: "walk", mood: "fussy" }),
    { id: "s", event_type: "settle", started_at: t(22, "10:30"), ended_at: t(22, "10:45"), payload: { tried: [{ method: "pat", at: t(22, "10:31") }], outcome: "stopped", mood: "crying" } },
  ];
  const { rows, failed } = sleepRows(events, NOW);
  it("numbers naps, measures awake windows to the start of settling, and settling time", () => {
    const c = rows.find((r) => r.id === "c")!;
    expect(c).toMatchObject({ label: "Nap 1", napIndex: 1, awakeBeforeMin: 50, settleMin: 28, durationMin: 50, worked: "walk", mood: "fussy" });
    expect(rows.find((r) => r.id === "a")).toMatchObject({ label: "Nap 1", awakeBeforeMin: 90, settleMin: 35 });
    expect(rows.find((r) => r.id === "b")).toMatchObject({ label: "Nap 2", awakeBeforeMin: 100, settleMin: 10 });
    expect(rows.find((r) => r.id === "n22")!.label).toBe("Night");
    expect(failed).toEqual([{ id: "s", at: Date.parse(t(22, "10:30")), minutes: 15, tried: ["pat"], mood: "crying" }]);
  });
  it("compares naps and methods", () => {
    const naps = byNap(rows);
    expect(naps.find((n) => n.label === "Nap 1")).toMatchObject({ sleeps: 2, settled: 2, settleMed: 32, awakeMed: 70, moods: { fussy: 2 } });
    expect(naps.find((n) => n.label === "Nap 2")).toMatchObject({ sleeps: 1, settleMed: 10, moods: { calm: 1 } });
    const methods = byMethod(rows, failed);
    expect(methods.find((m) => m.method === "walk")).toMatchObject({ worked: 2, tried: 2, settleMedWhenWorked: 32 });
    expect(methods.find((m) => m.method === "breastfeed")).toMatchObject({ worked: 1, tried: 2 });
    expect(methods.find((m) => m.method === "pat")).toMatchObject({ worked: 0, tried: 1 });
  });
  it("skips a logging gap instead of calling it a 12-hour awake window, and drops implausible sleeps", () => {
    const r = sleepRows([sleep("x", t(20, "08:00"), t(20, "09:00")), sleep("y", t(21, "10:00"), t(21, "11:00")), sleep("bad", t(18, "07:00"), t(21, "07:00"))], NOW).rows;
    expect(r.map((x) => x.id)).toEqual(["x", "y"]);
    expect(r[1].awakeBeforeMin).toBeNull();
  });
  it("formats minutes", () => {
    expect([fmtMin(null), fmtMin(28), fmtMin(95)]).toEqual(["—", "28m", "1h 35m"]);
  });
});

describe("time zones", () => {
  it("numbers naps by the family's clock when asked, whatever the runtime's zone", () => {
    // 8:50 am New York = 12:50 UTC; a UTC server must still call it Nap 1 of Oct 22.
    const r = sleepRows([sleep("c", "2026-10-22T12:50:00Z", "2026-10-22T13:40:00Z")], NOW, "America/New_York").rows[0];
    expect(r).toMatchObject({ label: "Nap 1", date: "2026-10-22" });
    const night = sleepRows([sleep("n", "2026-10-23T02:00:00Z", "2026-10-23T08:00:00Z")], NOW, "America/New_York").rows[0];
    expect(night).toMatchObject({ label: "Night", date: "2026-10-22" });
  });
});
