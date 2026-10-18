import { describe, expect, it } from "vitest";
import { describeLong, implausible, spanProblem, startProblem, tooLong } from "./plausible";
import { dailyStats } from "./reports";
import { rangeTiles } from "./rangeTiles";
import { guidesFor, rolling24h } from "./glance";

const H = 3_600_000;
// The real row from 2026-10-18: logged at 3:19 am Sunday, stored as starting Thursday.
const BAD = { id: "bad", event_type: "sleep", started_at: "2026-10-15T07:19:00Z", ended_at: "2026-10-18T07:20:00Z", payload: {}, kid_id: "e" };
const NAP = { id: "nap", event_type: "sleep", started_at: "2026-10-17T14:50:00Z", ended_at: "2026-10-17T16:13:56Z", payload: {}, kid_id: "e" };
const NOW = Date.parse("2026-10-18T23:46:00Z");

describe("plausible spans", () => {
  it("flags the 72-hour sleep and keeps real ones", () => {
    expect(implausible([BAD, NAP], NOW).map((e) => e.id)).toEqual(["bad"]);
    expect(tooLong(16 * H)).toBe(false);
    expect(tooLong(16 * H + 1)).toBe(true);
    expect(describeLong(BAD, NOW, "America/New_York")).toMatch(/Thu, Oct 15.*3:19 AM → Sun, Oct 18.*3:20 AM \(72 h\)/);
  });
  it("counts a running timer to now", () => {
    expect(implausible([{ ...BAD, ended_at: null }], NOW)).toHaveLength(1);
  });
  it("refuses a timer start days back or in the future, and a too-long manual entry", () => {
    expect(startProblem("2026-10-15T07:19:00Z", Date.parse("2026-10-18T07:19:55Z"), "America/New_York")).toMatch(/72 hours ago/);
    expect(startProblem("2026-10-18T06:00:00Z", Date.parse("2026-10-18T07:19:55Z"))).toBeNull();
    expect(startProblem(null, NOW)).toBeNull();
    expect(startProblem("2026-10-19T12:00:00Z", NOW)).toMatch(/future/);
    expect(spanProblem(BAD.started_at, BAD.ended_at)).toMatch(/72 hours/);
    expect(spanProblem(NAP.started_at, NAP.ended_at)).toBeNull();
    expect(spanProblem(NAP.ended_at, NAP.started_at)).toMatch(/after the start/);
  });
});

describe("the Oct 17 report, with the bad row left out", () => {
  const day = new Date(2026, 9, 17).getTime(); // local midnight (tests run in America/New_York)
  it("no longer reads 24 hours, and the Kids page 24h total skips it too", () => {
    const withBad = dailyStats([BAD, NAP] as never, day, 1, NOW)[0];
    expect(withBad.nightMs + withBad.napMs).toBe(24 * H);
    const clean = [BAD, NAP].filter((e) => !implausible([BAD, NAP], NOW).includes(e));
    const s = dailyStats(clean as never, day, 1, NOW)[0];
    expect(Math.round((s.nightMs + s.napMs) / 60_000)).toBe(84);
    expect(rolling24h([{ ...BAD, ended_at: "2026-10-18T07:20:00Z" }] as never, "e", Date.parse("2026-10-18T08:00:00Z")).sleepSeconds).toBe(0);
  });
  it("wet counts mixed, and the tile says so", () => {
    const d = (c: string, h: number) => ({ id: c + h, event_type: "diaper", started_at: new Date(day + h * H).toISOString(), ended_at: null, payload: { contents: c } });
    // Oct 17 as logged: 4 pee, 3 mixed, 1 poo.
    const evs = [d("pee", 1), d("pee", 6), d("both", 9), d("both", 12), d("both", 17), d("pee", 19), d("poo", 20), d("pee", 22)];
    const s = dailyStats(evs as never, day, 1, NOW)[0];
    const tiles = rangeTiles([s], guidesFor("2026-09-30", new Date(day + 12 * H)), () => guidesFor("2026-09-30", new Date(day + 12 * H)), { partial: false, average: false });
    const wet = tiles.find((t) => t.key === "wet")!;
    const dirty = tiles.find((t) => t.key === "dirty")!;
    expect(wet.value).toBe("7");
    expect(wet.detail).toBe("4 pee + 3 mixed");
    expect(dirty.value).toBe("4");
    expect(dirty.detail).toBe("1 poo + 3 mixed");
  });
});
