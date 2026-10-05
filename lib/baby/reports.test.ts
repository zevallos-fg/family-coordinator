import { describe, expect, it } from "vitest";
import { addDays, buckets, dailyStats, dayMarks, hm, startOfDay } from "./reports";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const ev = (id: string, event_type: string, s: string, e: string | null, payload: unknown = {}) => ({ id, event_type, started_at: s, ended_at: e, payload });
const oct5 = new Date(2026, 9, 5).getTime();
const now = new Date(2026, 9, 5, 18, 0).getTime();

describe("dayMarks", () => {
  it("clips a sleep that crosses midnight and marks the cut", () => {
    const m = dayMarks([ev("s", "sleep", at(4, 23), at(5, 6))], oct5, now);
    expect(m[0]).toMatchObject({ lane: "sleep", start: 0, end: 360, clippedStart: true, clippedEnd: false });
  });
  it("diapers are points, open timers run to now, bottles get a visible width", () => {
    const m = dayMarks(
      [ev("d", "diaper", at(5, 10), null), ev("f", "feed", at(5, 16, 30), null), ev("b", "feed", at(5, 12), at(5, 12), { method: "bottle" })],
      oct5,
      now
    );
    expect(m.find((x) => x.id === "d")).toMatchObject({ start: 600, end: null });
    expect(m.find((x) => x.id === "f")).toMatchObject({ start: 990, end: 1080 });
    expect(m.find((x) => x.id === "b")!.end).toBe(725);
  });
  it("ignores growth and medicine", () => {
    expect(dayMarks([ev("g", "growth", at(5, 9), null)], oct5, now)).toHaveLength(0);
  });
});

describe("dailyStats", () => {
  it("splits sleep into night (7pm–7am) and naps, at midnight, counting overlaps once", () => {
    const st = dailyStats(
      [ev("a", "sleep", at(4, 22), at(5, 8)), ev("b", "sleep", at(5, 5), at(5, 6)), ev("c", "sleep", at(5, 13), at(5, 15))],
      oct5,
      1,
      now
    )[0];
    expect(hm(st.nightMs)).toBe("7h 00m"); // 00:00–07:00
    expect(hm(st.napMs)).toBe("3h 00m"); // 07:00–08:00 + 13:00–15:00
  });
  it("counts feeds, nursing time, bottles, wet and dirty", () => {
    const st = dailyStats(
      [
        ev("f1", "feed", at(5, 9), at(5, 9, 30), { method: "breast", segments: [{ side: "L", seconds: 600 }, { side: "R", seconds: 300 }] }),
        ev("f2", "feed", at(5, 12), at(5, 12), { method: "bottle", amount: 2, unit: "oz" }),
        ev("d1", "diaper", at(5, 10), null, { contents: "both" }),
        ev("d2", "diaper", at(5, 11), null, { contents: "pee" }),
        ev("d3", "diaper", at(5, 14), null, { contents: "dry" }),
      ],
      oct5,
      1,
      now
    )[0];
    expect(st).toMatchObject({ feeds: 2, bottles: 1, nursingMs: 900_000, wet: 2, dirty: 1, diapers: 3, logged: true });
    // Exclusive kinds stack back to the total; mixed counts once there.
    expect(st).toMatchObject({ peeOnly: 1, mixed: 1, pooOnly: 0, dry: 1 });
    expect(st.peeOnly + st.mixed + st.pooOnly + st.dry).toBe(st.diapers);
  });
});

describe("buckets", () => {
  it("weeks average over logged days only, not empty ones", () => {
    const from = new Date(2026, 9, 5).getTime(); // a Monday
    const stats = dailyStats([ev("f", "feed", at(5, 9), at(5, 9, 10)), ev("g", "feed", at(6, 9), at(6, 9, 10)), ev("h", "feed", at(6, 12), at(6, 12, 10))], from, 7, now + 3 * 86_400_000);
    const [w] = buckets(stats, "week");
    expect(w.loggedDays).toBe(2);
    expect(w.feeds).toBe(1.5);
  });
  it("months group by calendar month", () => {
    const from = new Date(2026, 8, 29).getTime();
    const b = buckets(dailyStats([], from, 5, now), "month");
    expect(b.map((x) => new Date(x.start).getMonth())).toEqual([8, 9]);
  });
});

describe("calendar arithmetic", () => {
  it("adds days by calendar across the DST change", () => {
    const nov1 = new Date(2026, 10, 1).getTime();
    expect(new Date(addDays(nov1, 1)).getDate()).toBe(2);
    expect(new Date(addDays(nov1, 1)).getHours()).toBe(0);
    expect(startOfDay(new Date(2026, 10, 1, 15).getTime())).toBe(nov1);
  });
});
