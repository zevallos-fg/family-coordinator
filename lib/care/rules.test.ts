import { describe, expect, it } from "vitest";
import { bpBand, checkInWarnings, daysSince, parseBp, SOURCES } from "./rules";

describe("bpBand (Preeclampsia Foundation: either number counts)", () => {
  it("severe at 160 systolic or 110 diastolic", () => {
    expect(bpBand(160, 80)).toBe("severe");
    expect(bpBand(120, 110)).toBe("severe");
  });
  it("high at 140 or 90, by either number", () => {
    expect(bpBand(140, 70)).toBe("high");
    expect(bpBand(130, 90)).toBe("high");
    expect(bpBand(159, 109)).toBe("high");
  });
  it("under 140/90", () => {
    expect(bpBand(139, 89)).toBe("under");
  });
});

describe("parseBp", () => {
  it("accepts a plausible reading and refuses typos", () => {
    expect(parseBp("128", "84")).toEqual({ systolic: 128, diastolic: 84 });
    expect(parseBp("84", "128")).toBeNull();
    expect(parseBp("1280", "84")).toBeNull();
    expect(parseBp("12a", "84")).toBeNull();
  });
});

describe("checkInWarnings", () => {
  it("any 911 sign is raised as 911", () => {
    expect(checkInWarnings({ urgent: ["chest_pain"] })[0].level).toBe("911");
    expect(checkInWarnings({ urgent: ["harm_thoughts"] })[0].text).toContain("988");
  });
  it("a severe reading is raised at 911 level with the source", () => {
    const w = checkInWarnings({}, { systolic: 162, diastolic: 95 });
    expect(w[0]).toMatchObject({ level: "911", source: SOURCES.pfBp });
  });
  it("headache plus a high reading means call now", () => {
    expect(checkInWarnings({ headache: 6 }, { systolic: 142, diastolic: 88 }).some((w) => w.level === "call")).toBe(true);
  });
  it("vision changes always route to a call", () => {
    expect(checkInWarnings({ vision_changes: true })[0].level).toBe("call");
  });
  it("fever by AWHONN's bounds, both directions", () => {
    expect(checkInWarnings({ temp_f: 100.4 })[0].level).toBe("call");
    expect(checkInWarnings({ temp_f: 96.8 })[0].level).toBe("call");
    expect(checkInWarnings({ temp_f: 99.1 })).toHaveLength(0);
  });
  it("a positional headache with nothing else is information, not an alarm", () => {
    const w = checkInWarnings({ headache: 5, headache_lying: "better" }, { systolic: 122, diastolic: 78 });
    expect(w.map((x) => x.level)).toEqual(["info"]);
  });
  it("a positional headache that medicine doesn't help still says call", () => {
    const w = checkInWarnings({ headache: 7, headache_lying: "better", headache_after_meds: "not_better" });
    expect(w.some((x) => x.level === "call")).toBe(true);
    expect(w.some((x) => x.level === "info")).toBe(false);
  });
  it("every warning carries an https source", () => {
    const w = checkInWarnings(
      { urgent: ["seizure", "harm_thoughts"], vision_changes: true, headache: 8, headache_after_meds: "not_better", temp_f: 101, bleeding: "soaking", incision: "red", leg: true, mood: "low" },
      { systolic: 170, diastolic: 112 }
    );
    expect(w.length).toBeGreaterThan(8);
    expect(w.every((x) => x.source.url.startsWith("https://"))).toBe(true);
  });
});

describe("daysSince", () => {
  it("birth day is day 0", () => {
    expect(daysSince("2026-09-30", new Date(2026, 9, 5, 20))).toBe(5);
  });
});
