import { describe, it, expect } from "vitest";
import {
  formatAgo,
  formatClock,
  formatDuration,
  secondsBetween,
} from "./format";
import { TILE_MODE, defaultKidId, openEventFor, type BabyEvent } from "./events";

describe("formatClock", () => {
  it("reads as a stopwatch under an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(252)).toBe("4:12");
  });

  it("grows an hours field rather than showing 90 minutes", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("never shows a negative clock", () => {
    // Device clock skew against the server's now() can make elapsed go negative.
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("formatDuration", () => {
  it("uses the largest unit that stays readable", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(252)).toBe("4m 12s");
    expect(formatDuration(3780)).toBe("1h 03m");
  });

  it("renders a dash for a missing value rather than NaN", () => {
    // since_prev_s is null for the first contraction in the window, every time.
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");

  it("collapses the first minute", () => {
    expect(formatAgo("2026-09-06T11:59:30Z", now)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(formatAgo("2026-09-06T11:20:00Z", now)).toBe("40m ago");
    expect(formatAgo("2026-09-06T09:15:00Z", now)).toBe("2h 45m ago");
    expect(formatAgo("2026-09-04T12:00:00Z", now)).toBe("2d ago");
  });

  it("handles a missing timestamp", () => {
    expect(formatAgo(null, now)).toBe("—");
  });
});

describe("secondsBetween", () => {
  it("measures forward and clamps backwards", () => {
    const now = Date.parse("2026-09-06T12:00:00Z");
    expect(secondsBetween("2026-09-06T11:58:00Z", now)).toBe(120);
    expect(secondsBetween("2026-09-06T12:05:00Z", now)).toBe(0);
    expect(secondsBetween(null, now)).toBeNull();
  });
});

function event(over: Partial<BabyEvent>): BabyEvent {
  return {
    id: "e1",
    family_id: "f1",
    kid_id: "k1",
    event_type: "feed",
    started_at: "2026-09-06T10:00:00Z",
    ended_at: null,
    payload: {},
    logged_by_user_id: null,
    written_by: "app",
    source: "app",
    note: null,
    created_at: "2026-09-06T10:00:00Z",
    ...over,
  } as BabyEvent;
}

describe("openEventFor", () => {
  it("finds a running timer for the selected kid", () => {
    const events = [event({ id: "a", event_type: "sleep", ended_at: null })];
    expect(openEventFor(events, "sleep", "k1")?.id).toBe("a");
  });

  it("ignores a running timer belonging to another kid", () => {
    const events = [event({ id: "a", event_type: "sleep", kid_id: "k2" })];
    expect(openEventFor(events, "sleep", "k1")).toBeNull();
  });

  it("never treats a diaper as running", () => {
    // fn_baby_log leaves ended_at null forever, so an open diaper row is normal.
    // Reading it as a timer would light a stopwatch that can never be stopped.
    expect(TILE_MODE.diaper).toBe("point");
    const events = [event({ id: "a", event_type: "diaper", ended_at: null })];
    expect(openEventFor(events, "diaper", "k1")).toBeNull();
  });

  it("skips a finished timer", () => {
    const events = [
      event({ id: "a", event_type: "feed", ended_at: "2026-09-06T10:20:00Z" }),
    ];
    expect(openEventFor(events, "feed", "k1")).toBeNull();
  });
});

describe("defaultKidId", () => {
  it("returns null when the baby has no row yet", () => {
    expect(defaultKidId([])).toBeNull();
  });

  it("picks the youngest known birth date", () => {
    const kids = [
      { id: "older", birth_date: "2021-03-01" },
      { id: "baby", birth_date: "2026-09-01" },
    ];
    expect(defaultKidId(kids)).toBe("baby");
  });

  it("sorts an unknown birth date last, not first", () => {
    const kids = [
      { id: "unknown", birth_date: null },
      { id: "baby", birth_date: "2026-09-01" },
    ];
    expect(defaultKidId(kids)).toBe("baby");
  });
});
