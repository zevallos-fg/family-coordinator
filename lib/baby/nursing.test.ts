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
  eventDurationSeconds,
  finishSession,
  parseSideDuration,
  planSideEdit,
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
    // Stamped with the instant it stopped, which is what Done reads the end from.
    expect(p.segments).toEqual([{ side: "R", seconds: 780, ended: "2026-09-06T14:13:00.000Z" }]);
    expect(p.running).toBeNull();
    expect(p.last_side).toBe("R");
  });

  it("starting the other side stops the first in one step", () => {
    let p: FeedPayload = startSide({}, "R", T0);
    p = startSide(p, "L", "2026-09-06T14:13:00.000Z");

    // The R spell is banked, and only L is live. There is no moment where both are.
    expect(p.segments).toEqual([{ side: "R", seconds: 780, ended: "2026-09-06T14:13:00.000Z" }]);
    expect(p.running).toEqual({ side: "L", since: "2026-09-06T14:13:00.000Z" });
  });

  it("adds up to the shape the export actually stores", () => {
    let p: FeedPayload = startSide({}, "R", T0);
    p = startSide(p, "L", "2026-09-06T14:13:00.000Z");
    p = stopRunning(p, t("2026-09-06T14:23:00.000Z"));

    expect(p.segments).toEqual([
      { side: "R", seconds: 780, ended: "2026-09-06T14:13:00.000Z" },
      { side: "L", seconds: 600, ended: "2026-09-06T14:23:00.000Z" },
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
      { side: "L", seconds: 300, ended: "2026-09-06T14:05:00.000Z" },
      { side: "L", seconds: 120, ended: "2026-09-06T14:12:00.000Z" },
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

/**
 * The feed in the screenshot that started this: Left 11:35, Right 34:56, but a
 * row that read 57m 26s because the end was whenever Done got tapped. Right was
 * the last spell, stopped at 20:08:31.
 */
const STARTED = "2026-09-30T19:22:00.000Z";
const stampedFeed = () => ({
  event_type: "feed",
  started_at: STARTED,
  ended_at: "2026-09-30T20:19:26.000Z",
  payload: {
    method: "breast",
    segments: [
      { side: "L", seconds: 695, ended: "2026-09-30T19:33:35.000Z" },
      { side: "R", seconds: 2096, ended: "2026-09-30T20:08:31.000Z" },
    ],
    running: null,
    last_side: "R",
  } as FeedPayload,
});
const NOW = t("2026-09-30T20:30:00.000Z");

describe("a breast feed's total", () => {
  it("is the sum of its spells, even when end − start is larger", () => {
    // 11:35 + 34:56 = 46:31, not the 57:26 between start and end.
    expect(eventDurationSeconds(stampedFeed())).toBe(2791);
  });

  it("is end − start for a bottle, and for a hand-entered feed with no spells", () => {
    const bottle = { ...stampedFeed(), payload: { method: "bottle", volume_ml: 90 } as FeedPayload };
    const manual = { ...stampedFeed(), payload: { method: "breast" } as FeedPayload };
    expect(eventDurationSeconds(bottle)).toBe(3446);
    expect(eventDurationSeconds(manual)).toBe(3446);
  });

  it("is null while running", () => {
    expect(eventDurationSeconds({ ...stampedFeed(), ended_at: null })).toBeNull();
  });
});

describe("Done", () => {
  it("ends the feed when the last stamped spell stopped, not now", () => {
    const { payload, endedAt } = finishSession(stampedFeed().payload, "2026-09-30T20:19:26.000Z");
    expect(endedAt).toBe("2026-09-30T20:08:31.000Z");
    expect(payload.running).toBeNull();
  });

  it("stops a side still running at now, and ends there", () => {
    const p = startSide({ method: "breast" }, "L", "2026-09-30T19:22:00.000Z");
    const { payload, endedAt } = finishSession(p, "2026-09-30T19:40:00.000Z");
    expect(endedAt).toBe("2026-09-30T19:40:00.000Z");
    expect(payload.segments).toEqual([{ side: "L", seconds: 1080, ended: "2026-09-30T19:40:00.000Z" }]);
  });

  it("ends a legacy feed with no stamps now, as before", () => {
    const legacy: FeedPayload = { segments: [{ side: "L", seconds: 600 }] };
    expect(finishSession(legacy, "2026-09-30T20:00:00.000Z").endedAt).toBe("2026-09-30T20:00:00.000Z");
  });
});

describe("editing a side", () => {
  it("trimming the last spell moves ended_at back by the same amount", () => {
    const plan = planSideEdit(stampedFeed(), "R", "13:56", NOW);
    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.endedAt).toBe("2026-09-30T19:47:31.000Z"); // 20:08:31 − 21m
    expect(plan.payload.segments).toEqual([
      { side: "L", seconds: 695, ended: "2026-09-30T19:33:35.000Z" },
      { side: "R", seconds: 836, ended: "2026-09-30T19:47:31.000Z" },
    ]);
  });

  it("trimming a spell that is not the last leaves ended_at alone", () => {
    const plan = planSideEdit(stampedFeed(), "L", "10", NOW);
    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.endedAt).toBeUndefined();
    expect(plan.payload.segments?.[0]).toEqual({ side: "L", seconds: 600, ended: "2026-09-30T19:33:35.000Z" });
  });

  it("never moves ended_at on a legacy feed whose spells carry no stamp", () => {
    const legacy = {
      ...stampedFeed(),
      payload: { segments: [{ side: "L", seconds: 695 }, { side: "R", seconds: 2096 }] } as FeedPayload,
    };
    for (const input of ["13:56", "40", "10"]) {
      for (const side of ["L", "R"] as const) {
        const plan = planSideEdit(legacy, side, input, NOW);
        expect(plan.kind).toBe("write");
        if (plan.kind === "write") expect(plan.endedAt).toBeUndefined();
      }
    }
  });

  it("does not write anything for input it cannot read", () => {
    for (const input of ["", "abc", "13:75", "-5", "1:2:3:4", "ten"]) {
      expect(planSideEdit(stampedFeed(), "R", input, NOW)).toEqual({ kind: "none" });
    }
  });

  it("clamps a lengthened last spell to now", () => {
    const plan = planSideEdit(stampedFeed(), "R", "120", NOW);
    expect(plan.kind === "write" && plan.endedAt).toBe("2026-09-30T20:30:00.000Z");
  });

  it("removes a spell cut to zero and keeps the order of the rest", () => {
    const plan = planSideEdit(stampedFeed(), "L", "0", NOW);
    expect(plan.kind === "write" && plan.payload.segments).toEqual([
      { side: "R", seconds: 2096, ended: "2026-09-30T20:08:31.000Z" },
    ]);
  });

  it("refuses to zero the only side left", () => {
    const one = { ...stampedFeed(), payload: { segments: [{ side: "R", seconds: 300 }] } as FeedPayload };
    expect(planSideEdit(one, "R", "0", NOW)).toEqual({
      kind: "refuse",
      message: "Use Delete to remove the feed.",
    });
  });

  it("reads 10, 10:00 and 10m 0s as the same ten minutes", () => {
    expect(parseSideDuration("10")).toBe(600);
    expect(parseSideDuration("10:00")).toBe(600);
    expect(parseSideDuration("10m 0s")).toBe(600);
    expect(parseSideDuration("1:02:30")).toBe(3750);
  });
});

describe("editing a side on an open feed", () => {
  // Left ran 5m 33s, paused; Right started 00:20:00 and was left running.
  const openFeed = (running: boolean) => ({
    started_at: "2026-10-01T04:16:00.000Z",
    ended_at: null,
    payload: {
      method: "breast",
      segments: [{ side: "L", seconds: 333, ended: "2026-10-01T04:21:33.000Z" }],
      running: running ? { side: "R", since: "2026-10-01T04:22:00.000Z" } : null,
    } as FeedPayload,
  });
  const LATER = Date.parse("2026-10-01T04:45:00.000Z"); // Right has run 23m

  it("stops a side left running, then sets it to the number typed", () => {
    const plan = planSideEdit(openFeed(true), "R", "5", LATER);
    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.payload.running).toBeNull();
    expect(sideTotals(segmentsOf(plan.payload)).R).toBe(300);
    // The spell's stop moves back with the cut, so Done ends the feed there.
    expect(plan.payload.segments?.at(-1)).toEqual({ side: "R", seconds: 300, ended: "2026-10-01T04:27:00.000Z" });
  });

  it("never sets ended_at — the feed stays open until Done", () => {
    for (const running of [true, false]) {
      const plan = planSideEdit(openFeed(running), "L", "2", LATER);
      expect(plan.kind === "write" && plan.endedAt).toBeFalsy();
    }
  });

  it("Done after the edit ends at the corrected stop, not at Done", () => {
    const plan = planSideEdit(openFeed(true), "R", "5", LATER);
    if (plan.kind !== "write") throw new Error("expected a write");
    expect(finishSession(plan.payload, "2026-10-01T05:00:00.000Z").endedAt).toBe("2026-10-01T04:27:00.000Z");
  });
});
