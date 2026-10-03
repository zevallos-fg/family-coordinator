import { describe, expect, it } from "vitest";
import { growthPayload, growthSummary, weightLabel } from "./growth";
import { eventSummary } from "./summary";

describe("growth in US units", () => {
  it("stores weight as entered, with kg alongside", () => {
    const r = growthPayload({ lb: "8", oz: "9", height: "", head: "" });
    expect("payload" in r && r.payload).toEqual({ weight_lb: 8, weight_oz: 9, weight_kg: 3.884 });
  });

  it("reads back exactly what was typed", () => {
    const r = growthPayload({ lb: "8", oz: "0", height: "20.5", head: "13.75" });
    if (!("payload" in r)) throw new Error(r.error);
    expect(growthSummary(r.payload as Record<string, unknown>)).toBe("8 lb 0 oz · 20.5 in · head 13.75 in");
    expect(r.payload.height_cm).toBe(52.1);
  });

  it("prefers the entered lb/oz over the stored kg", () => {
    // 3.9 kg converts to 8 lb 9.6 oz; the scale said 8 lb 9 oz, and that is what shows.
    expect(weightLabel({ weight_lb: 8, weight_oz: 9, weight_kg: 3.9 })).toBe("8 lb 9 oz");
  });

  it("refuses 16 oz or more, junk, and an empty form", () => {
    expect("error" in growthPayload({ lb: "7", oz: "16", height: "", head: "" })).toBe(true);
    expect("error" in growthPayload({ lb: "8a", oz: "", height: "", head: "" })).toBe(true);
    expect("error" in growthPayload({ lb: "", oz: "", height: "", head: "" })).toBe(true);
  });

  it("older metric-only rows are shown in lb/oz and inches", () => {
    expect(weightLabel({ weight_kg: 3.884 })).toBe("8 lb 9 oz");
    expect(eventSummary("growth", { weight_kg: 3.629, height_cm: 50.8 })).toBe("8 lb 0 oz · 20 in");
  });
});
