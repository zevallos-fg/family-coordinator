import { describe, it, expect } from "vitest";
import {
  segmentsOf,
  sideTotals,
  sessionSeconds,
  displaySeconds,
  stopRunning,
  startSide,
  suggestedSide,
  lastSideOf,
  formatDuration,
  type FeedPayload,
} from "./nursing";

const T0 = "2026-09-06T14:00:00.000Z";
const t = (iso: string) => Date.parse(iso);

describe("segmentsOf", () => {
  it("ignores anything that is not a segment", () => {
    // payload is jsonb — it can hold whatever a previous version or an import wrote.
    const payload = {
      segments: [
        { side: "L", seconds: 60 },
        { side: "X", seconds: 60 },
        { side: "R", seconds: -5 },
        { side: "R" },
        null,
        { side: "R", seconds: 30 },
      ],
    } as unknown as FeedPayload;
    expect(segmentsOf(payload)).toEqual([
      { side: "L", seconds: 60 },
      { side: "R", seconds: 30 },
    ]);
  });

  it("survives a payload with no segments at all", () => {
    expect(segmentsOf(null)).toEqual([]);
    expect(segmentsOf({})).toEqual([]);
  });
});

describe("a session, side by side", () => {
  it("banks a segment when a side stops, and remembers which side that was", () => {
    let p: FeedPayload = startSide({}, "R", T0);
    expect(p.running).toEqual({ side: "R", since: T0 });

    p = stopRunning(p, t("2026-09-06T14:13:00.000Z"));
    expect(p.segments).toEqual([{ side: "R", seconds: 780 }]);
    expect(p.running).toBeNull();
    expect(p.last_side).toBe("R");
  });

  it("starting the other side stops the first in one step", () => {
    let p: FeedPayload = startSide({}, "R", T0);
    p = startSide(p, "L", "2026-09-06T14:13:00.000Z");

    // The R spell is banked, and only L is live. There is no moment where both are.
    expect(p.segments).toEqual([{ side: "R", seconds: 780 }]);
    expect(p.running).toEqual({ side: "L", since: "2026-09-06T14:13:00.000Z" });
  });

  it("adds up to the shape the export actually stores", () => {
    let p: FeedPayload = startSide({}, "R", T0);
    p = startSide(p, "L", "2026-09-06T14:13:00.000Z");
    p = stopRunning(p, t("2026-09-06T14:23:00.000Z"));

    expect(p.segments).toEqual([
      { side: "R", seconds: 780 },
      { side: "L", seconds: 600 },
    ]);
    expect(p.last_side).toBe("L");
    expect(sessionSeconds(p, t("2026-09-06T14:30:00.000Z"))).toBe(1380);
  });

  it("keeps two spells on the same side as two segments", () => {
    // Merging them would lose the order the export records.
    let p: FeedPayload = startSide({}, "L", T0);
    p = stopRunning(p, t("2026-09-06T14:05:00.000Z"));
    p = startSide(p, "L", "2026-09-06T14:10:00.000Z");
    p = stopRunning(p, t("2026-09-06T14:12:00.000Z"));

    expect(p.segments).toEqual([
      { side: "L", seconds: 300 },
      { side: "L", seconds: 120 },
    ]);
    expect(sideTotals(segmentsOf(p)).L).toBe(420);
  });
});

describe("the running clock", () => {
  it("counts the live side against the clock, and only that side", () => {
    let p: FeedPayload = startSide({}, "R", T0);
    p = startSide(p, "L", "2026-09-06T14:13:00.000Z");
    const now = t("2026-09-06T14:18:00.000Z");

    expect(displaySeconds(p, "R", now)).toBe(780); // banked, not moving
    expect(displaySeconds(p, "L", now)).toBe(300); // live
    expect(sessionSeconds(p, now)).toBe(1080);
  });

  it("never shows a negative timer when the device clock is behind the server", () => {
    const p: FeedPayload = startSide({}, "L", "2026-09-06T14:13:00.000Z");
    expect(sessionSeconds(p, t("2026-09-06T14:00:00.000Z"))).toBe(0);
  });

  it("a session with nothing running is just its segments", () => {
    const p: FeedPayload = { segments: [{ side: "L", seconds: 90 }], running: null };
    expect(sessionSeconds(p, Date.now())).toBe(90);
  });
});

describe("where to start next time", () => {
  it("suggests the opposite of the side that finished last", () => {
    expect(suggestedSide("L")).toBe("R");
    expect(suggestedSide("R")).toBe("L");
  });

  it("suggests left when there is no history — a first feed has to start somewhere", () => {
    expect(suggestedSide(null)).toBe("L");
    expect(suggestedSide(undefined)).toBe("L");
  });

  it("falls back to the final segment when last_side was never written", () => {
    // Rows written by an import, or by an older build, may have segments only.
    const p = { segments: [{ side: "R", seconds: 10 }, { side: "L", seconds: 20 }] } as FeedPayload;
    expect(lastSideOf(p)).toBe("L");
    expect(lastSideOf({})).toBeNull();
  });
});

describe("formatDuration", () => {
  it("drops the minutes while there are none", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(60)).toBe("1m 00s");
    expect(formatDuration(780)).toBe("13m 00s");
    expect(formatDuration(1385)).toBe("23m 05s");
  });
});
