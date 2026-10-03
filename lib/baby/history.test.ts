import { describe, expect, it } from "vitest";
import { daySummary, groupByDay } from "./history";
import { bottlePayload } from "./bottle";

process.env.TZ = "America/New_York";

const ev = (id: string, started: string, ended: string | null, payload: unknown = {}) => ({
  id,
  event_type: "feed",
  started_at: started,
  ended_at: ended,
  payload,
});

describe("history grouping", () => {
  const now = new Date("2026-10-03T11:44:00.000Z"); // 7:44 am New York

  it("keeps every entry, newest day and newest entry first, with no cap", () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      ev(`e${i}`, new Date(now.getTime() - (i + 1) * 2.5 * 3600_000).toISOString(), null)
    );
    const days = groupByDay(events, now);
    expect(days.flatMap((d) => d.events)).toHaveLength(40);
    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Yesterday");
    const firstDay = days[0].events.map((e) => Date.parse(e.started_at));
    expect([...firstDay].sort((a, b) => b - a)).toEqual(firstDay);
  });

  it("files an event under the LOCAL day it started, not the UTC day", () => {
    // 11:30 pm Oct 2 in New York is already Oct 3 in UTC.
    const days = groupByDay([ev("late", "2026-10-03T03:30:00.000Z", null)], now);
    expect(days[0].key).toBe("2026-10-02");
    expect(days[0].label).toBe("Yesterday");
  });
});

describe("day summary", () => {
  it("feeds: count, nursing as Left + Right, bottles per unit and never mixed", () => {
    const events = [
      ev("a", "2026-10-03T08:00:00.000Z", "2026-10-03T09:00:00.000Z", {
        method: "breast",
        segments: [
          { side: "L", seconds: 600 },
          { side: "R", seconds: 300 },
        ],
      }),
      ev("b", "2026-10-03T07:00:00.000Z", "2026-10-03T07:00:00.000Z", bottlePayload(7, "ml", "")),
      ev("c", "2026-10-03T06:00:00.000Z", "2026-10-03T06:00:00.000Z", bottlePayload(2, "oz", "")),
    ];
    expect(daySummary("feed", events)).toBe("3 feeds · nursing 15m 00s · bottle 7 ml + 2 oz");
  });

  it("a running feed counts as a feed but adds no time", () => {
    const events = [ev("r", "2026-10-03T11:42:00.000Z", null, { method: "breast", segments: [] })];
    expect(daySummary("feed", events)).toBe("1 feed");
  });
});
