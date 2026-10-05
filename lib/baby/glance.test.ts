import { describe, expect, it } from "vitest";
import { ageInDays, ageInMonths, awakeState, guidesFor, rolling24h, wakeWindow } from "./glance";

const now = new Date(2026, 9, 5, 15, 0, 0); // Oct 5 2026, 3pm local
const nowMs = now.getTime();
const ago = (min: number) => new Date(nowMs - min * 60_000).toISOString();
const ev = (event_type: string, startMin: number, endMin: number | null, payload: unknown = {}, kid_id = "k1") => ({
  event_type,
  kid_id,
  started_at: ago(startMin),
  ended_at: endMin === null ? null : ago(endMin),
  payload,
});

describe("age", () => {
  it("counts calendar days, birth day is 0", () => {
    expect(ageInDays("2026-09-30", now)).toBe(5);
    expect(ageInDays("2026-10-05", now)).toBe(0);
    expect(ageInDays(null, now)).toBeNull();
    expect(ageInDays("2026-10-06", now)).toBeNull();
  });
  it("counts completed months", () => {
    expect(ageInMonths("2023-02-09", now)).toBe(43);
    expect(ageInMonths("2026-09-05", now)).toBe(1);
    expect(ageInMonths("2026-09-06", now)).toBe(0);
  });
});

describe("guidesFor", () => {
  it("day 5 newborn gets the day-5 diaper ranges", () => {
    const g = guidesFor("2026-09-30", now);
    expect(g.feeds?.range).toBe("8–12");
    expect(g.wet?.range).toBe("6+");
    expect(g.stools?.range).toBe("3–4+");
    expect(g.sleep?.range).toBe("14–17h");
    expect(g.wake?.ruleOfThumb).toBe(true);
  });
  it("first days use the early ranges", () => {
    const g = guidesFor("2026-10-03", now); // day 2
    expect(g.wet?.range).toBe("2–3");
    expect(g.stools?.range).toBe("2+");
  });
  it("a preschooler gets sleep only — no infant ranges follow him", () => {
    const g = guidesFor("2023-02-09", now);
    expect(Object.keys(g)).toEqual(["sleep"]);
    expect(g.sleep?.range).toBe("10–13h");
  });
  it("every range names an https source", () => {
    for (const g of Object.values(guidesFor("2026-09-30", now))) {
      expect(g!.source.url.startsWith("https://")).toBe(true);
    }
  });
  it("no birth date, no ranges", () => {
    expect(guidesFor(null, now)).toEqual({});
  });
});

describe("rolling24h", () => {
  it("counts the last 24 hours for this kid only", () => {
    const r = rolling24h(
      [
        ev("feed", 30, 10),
        ev("feed", 25 * 60, 24.9 * 60), // outside
        ev("feed", 60, 40, {}, "k2"), // other kid
        ev("diaper", 50, null, { contents: "both" }),
        ev("diaper", 70, null, { contents: "pee" }),
        ev("diaper", 80, null, { contents: "dry" }),
      ],
      "k1",
      nowMs
    );
    expect(r).toMatchObject({ feeds: 1, wet: 2, stools: 1 });
  });
  it("clips sleep to the window and counts a running sleep up to now", () => {
    const r = rolling24h([ev("sleep", 25 * 60, 23 * 60), ev("sleep", 30, null)], "k1", nowMs);
    expect(r.sleepSeconds).toBe(60 * 60 + 30 * 60);
  });
});

describe("awakeState", () => {
  it("awake since the latest end, not the latest start", () => {
    const s = awakeState([ev("sleep", 120, 20), ev("sleep", 300, 10)], "k1", nowMs);
    expect(s).toEqual({ state: "awake", since: ago(10) });
  });
  it("asleep while a sleep is running", () => {
    expect(awakeState([ev("sleep", 120, 20), ev("sleep", 15, null)], "k1", nowMs)).toEqual({
      state: "asleep",
      since: ago(15),
    });
  });
  it("null with no sleep for this kid", () => {
    expect(awakeState([ev("sleep", 120, 20, {}, "k2")], "k1", nowMs)).toBeNull();
  });
});

describe("sleep overlap", () => {
  it("counts overlapping sleeps once", () => {
    // 3h and 1h sleeps that share an hour → 3h, not 4h.
    const r = rolling24h([ev("sleep", 240, 60), ev("sleep", 120, 60)], "k1", nowMs);
    expect(r.sleepSeconds).toBe(3 * 3600);
  });
});

describe("wakeWindow", () => {
  // Woke at 4:27; window 30–90 min → opens 4:57, closes 5:57.
  const woke = new Date(2026, 9, 5, 16, 27).toISOString();
  const at = (h: number, m: number) => new Date(2026, 9, 5, h, m).getTime();
  it("counts down to the window opening", () => {
    expect(wakeWindow(woke, [30, 90], at(16, 45))).toMatchObject({ phase: "before", secondsLeft: 12 * 60 });
  });
  it("counts down to the window closing once open", () => {
    expect(wakeWindow(woke, [30, 90], at(17, 15))).toMatchObject({ phase: "open", secondsLeft: 42 * 60 });
  });
  it("says past, with nothing left, after the far end", () => {
    expect(wakeWindow(woke, [30, 90], at(18, 0))).toMatchObject({ phase: "past", secondsLeft: 0 });
  });
  it("the guide carries the minutes the countdown uses", () => {
    expect(guidesFor("2026-09-30", now).wake?.windowMinutes).toEqual([30, 90]);
  });
});
