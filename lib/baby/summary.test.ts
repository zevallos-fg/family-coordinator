import { describe, it, expect } from "vitest";
import { diaperSummary, eventSummary, feedSummary, todayTotals } from "./summary";

describe("feedSummary", () => {
  it("gives per-side totals in the order they happened", () => {
    expect(
      feedSummary({ segments: [{ side: "L", seconds: 600 }, { side: "R", seconds: 780 }] })
    ).toBe("(L) 10m 00s, (R) 13m 00s");
  });

  it("stars the side to start on next, which is the opposite of the last one", () => {
    // Ended on L, so the next feed starts on R.
    const s = feedSummary(
      { segments: [{ side: "R", seconds: 780 }, { side: "L", seconds: 600 }], last_side: "L" },
      { markNextSide: true }
    );
    expect(s).toContain("(R*)");
    expect(s).not.toContain("(L*)");
  });

  it("sums two spells on the same side without losing the order of first use", () => {
    expect(
      feedSummary({
        segments: [
          { side: "R", seconds: 300 },
          { side: "L", seconds: 120 },
          { side: "R", seconds: 300 },
        ],
      })
    ).toBe("(R) 10m 00s, (L) 2m 00s");
  });

  it("describes a bottle by volume rather than by sides", () => {
    expect(feedSummary({ method: "bottle", volume_ml: 120, contents: "Breast Milk" })).toBe(
      "120 ml · Breast Milk"
    );
  });
});

describe("diaperSummary", () => {
  it("reads back the export's own shape", () => {
    expect(diaperSummary({ contents: "pee", pee_amount: "large" })).toBe("Pee, large");
  });

  it("names which amount is which when there was both", () => {
    expect(
      diaperSummary({ contents: "both", pee_amount: "large", poo_amount: "medium" })
    ).toBe("Both, pee large, poo medium");
  });

  it("carries consistency when it was filled, and says nothing when it was not", () => {
    expect(diaperSummary({ contents: "poo", poo_amount: "small", consistency: "loose" })).toBe(
      "Poo, small · loose"
    );
    // Filled 20.9% of the time in three years. Absent is the normal case.
    expect(diaperSummary({ contents: "poo", poo_amount: "small" })).toBe("Poo, small");
  });

  it("is just the type when nothing else was answered", () => {
    expect(diaperSummary({ contents: "dry" })).toBe("Dry");
  });
});

describe("eventSummary", () => {
  it("returns null when there is nothing to say, so the caller picks the sentence", () => {
    // Null rather than "", because "no entries yet" and "" are different lines.
    expect(eventSummary("sleep", {})).toBeNull();
    expect(eventSummary("diaper", {})).toBeNull();
  });

  it("gives sleep its one location chip and nothing else", () => {
    expect(eventSummary("sleep", { location: "crib" })).toBe("crib");
  });
});

describe("todayTotals", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 8, 8, h, 0, 0)).toISOString();

  it("counts feeds and diapers and sums finished sleep", () => {
    const totals = todayTotals(
      [
        { event_type: "feed", started_at: t(1), ended_at: t(2) },
        { event_type: "feed", started_at: t(3), ended_at: t(4) },
        { event_type: "diaper", started_at: t(2), ended_at: null },
        { event_type: "sleep", started_at: t(5), ended_at: t(6) },
      ],
      Date.parse(t(7))
    );
    expect(totals).toEqual({ feeds: 2, diapers: 1, sleepSeconds: 3600 });
  });

  it("counts a nap still in progress up to now", () => {
    // Omitting it would leave out the one nap the person is asking about.
    const totals = todayTotals(
      [{ event_type: "sleep", started_at: t(5), ended_at: null }],
      Date.parse(t(6))
    );
    expect(totals.sleepSeconds).toBe(3600);
  });
});
