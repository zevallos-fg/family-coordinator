import { describe, expect, it } from "vitest";
import { medicinePayload, nextDueLabel, parseInterval } from "./medicine";
import { eventSummary } from "./summary";

process.env.TZ = "America/New_York";

describe("medicine", () => {
  it("a dose records the medicine exactly as entered", () => {
    expect(medicinePayload({ id: "m1", name: "Vitamin D drops", dose: "1 drop (400 IU)" })).toEqual({
      medication_id: "m1",
      name: "Vitamin D drops",
      dose: "1 drop (400 IU)",
    });
    expect(eventSummary("medicine", { name: "Vitamin D drops", dose: "1 drop (400 IU)" })).toBe(
      "Vitamin D drops · 1 drop (400 IU)"
    );
  });

  it("interval: blank is as-needed, junk and zero are refused", () => {
    expect(parseInterval("")).toBeNull();
    expect(parseInterval("6")).toBe(6);
    expect(parseInterval("4.5")).toBe(4.5);
    expect(parseInterval("0")).toBe("invalid");
    expect(parseInterval("six")).toBe("invalid");
  });

  it("next due: upcoming, due now, overdue, or nothing when as-needed", () => {
    const now = Date.parse("2026-10-05T16:00:00.000Z"); // 12:00 pm Eastern
    expect(nextDueLabel("2026-10-05T20:30:00.000Z", now)).toEqual({ text: "Next: 4:30 pm", overdue: false });
    expect(nextDueLabel("2026-10-05T15:58:00.000Z", now)).toEqual({ text: "Due now", overdue: true });
    expect(nextDueLabel("2026-10-05T14:00:00.000Z", now)?.overdue).toBe(true);
    expect(nextDueLabel(null, now)).toBeNull();
  });
});
