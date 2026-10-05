import { describe, expect, it } from "vitest";
import { dueAt } from "./AddItem";

process.env.TZ = "America/New_York";

describe("AddItem due dates", () => {
  // 11:44 pm Eastern on Oct 4 is already Oct 5 in UTC.
  const lateNight = new Date("2026-10-05T03:44:00.000Z");

  it("Today at 11:44 pm is still today once it reaches the database", () => {
    expect(dueAt("today", lateNight)!.slice(0, 10)).toBe("2026-10-04");
  });

  it("Tomorrow and Next week land on the right local days", () => {
    expect(dueAt("tomorrow", lateNight)!.slice(0, 10)).toBe("2026-10-05");
    expect(dueAt("week", lateNight)!.slice(0, 10)).toBe("2026-10-11");
  });

  it("No date stays undated", () => {
    expect(dueAt("none", lateNight)).toBeNull();
  });
});
