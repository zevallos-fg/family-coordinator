import { describe, expect, it } from "vitest";
import { bottleAmountLabel, bottlePayload, isBottle, manualBreastFeed, parseAmount } from "./bottle";
import { eventDuration, feedSummary } from "./summary";
import { finishSession, isTimedNursing, planSideEdit, sideTotals, segmentsOf } from "./nursing";

describe("bottle amounts", () => {
  it("reads decimals and commas, refuses junk and zero", () => {
    expect(parseAmount("120")).toBe(120);
    expect(parseAmount("4.5")).toBe(4.5);
    expect(parseAmount("4,5")).toBe(4.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("4.5.1")).toBeNull();
  });

  it("keeps the amount as entered, with ml alongside for oz", () => {
    const p = bottlePayload(4, "oz", "Formula");
    expect(p).toMatchObject({ method: "bottle", amount: 4, unit: "oz", contents: "Formula" });
    expect(p.volume_ml).toBe(118.3);
    expect(bottleAmountLabel(p)).toBe("4 oz");
  });

  it("never invents a volume for grams", () => {
    const p = bottlePayload(90, "g", "Breast Milk");
    expect(p.volume_ml).toBeUndefined();
    expect(feedSummary(p as Record<string, unknown>)).toBe("90 g · Breast Milk");
  });

  it("still reads legacy ml-only bottles", () => {
    expect(feedSummary({ method: "bottle", volume_ml: 120 })).toBe("120 ml");
  });

  it("a bottle is not a nursing session and has no duration", () => {
    const p = bottlePayload(4, "oz", "");
    expect(isBottle(p)).toBe(true);
    expect(isTimedNursing(p)).toBe(false);
    const at = "2026-10-03T05:00:00.000Z";
    expect(eventDuration({ event_type: "feed", started_at: at, ended_at: at, payload: p })).toBeNull();
  });
});

describe("manual breast feed", () => {
  const start = "2026-10-03T04:31:00.000Z";

  it("lays the sides end to end from the start, first side first", () => {
    const feed = manualBreastFeed(start, { L: 600, R: 420 }, "R");
    expect(feed).not.toBeNull();
    expect(feed!.payload.segments).toEqual([
      { side: "R", seconds: 420, ended: "2026-10-03T04:38:00.000Z" },
      { side: "L", seconds: 600, ended: "2026-10-03T04:48:00.000Z" },
    ]);
    expect(feed!.endIso).toBe("2026-10-03T04:48:00.000Z");
    expect(feed!.payload.last_side).toBe("L");
  });

  it("total is Left + Right, and it behaves like a timed feed afterwards", () => {
    const feed = manualBreastFeed(start, { L: 600, R: 420 }, "L")!;
    const row = { event_type: "feed", started_at: start, ended_at: feed.endIso, payload: feed.payload };
    expect(eventDuration(row)).toBe("17m 00s");
    // Trimming the last side moves Ended back, exactly as for a timed feed.
    const plan = planSideEdit(row, "R", "2", Date.parse("2026-10-03T06:00:00.000Z"));
    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(sideTotals(segmentsOf(plan.payload)).R).toBe(120);
    expect(plan.endedAt).toBe("2026-10-03T04:43:00.000Z");
  });

  it("one side only is fine; neither side is refused", () => {
    expect(manualBreastFeed(start, { L: 0, R: 300 }, "L")!.payload.segments).toHaveLength(1);
    expect(manualBreastFeed(start, { L: 0, R: 0 }, "L")).toBeNull();
  });

  it("Done-style finishing agrees with the end it was given", () => {
    const feed = manualBreastFeed(start, { L: 300, R: 300 }, "L")!;
    expect(finishSession(feed.payload, "2026-10-03T09:00:00.000Z").endedAt).toBe(feed.endIso);
  });
});
