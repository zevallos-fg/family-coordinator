import { describe, expect, it } from "vitest";
import { BuildError, bottleFeed, breastFeed, citations, diaper, growth } from "./baby";
// The app's own builders: the connector must write exactly what the app writes.
import { manualBreastFeed, bottlePayload } from "../../../lib/baby/bottle";
import { growthPayload } from "../../../lib/baby/growth";
import { diaperPayload } from "../../../lib/baby/diaper";

const start = "2026-10-05T06:00:00.000Z";

describe("connector writes what the app writes", () => {
  it("breast feed: identical to the app's manual entry", () => {
    const viaClaude = breastFeed(start, 12, 8, "R");
    const viaApp = manualBreastFeed(start, { L: 720, R: 480 }, "R")!;
    expect(viaClaude.payload).toEqual(viaApp.payload);
    expect(viaClaude.endedAt).toBe(viaApp.endIso);
  });

  it("bottle: identical, including no invented volume for grams", () => {
    expect(bottleFeed(4, "oz", "Formula")).toEqual(bottlePayload(4, "oz", "Formula"));
    expect(bottleFeed(90, "g", "")).toEqual(bottlePayload(90, "g", ""));
  });

  it("growth: identical to the Growth screen for 8 lb 9 oz, 20.5 in", () => {
    const app = growthPayload({ lb: "8", oz: "9", height: "20.5", head: "" });
    if (!("payload" in app)) throw new Error(app.error);
    expect(growth({ weight_lb: 8, weight_oz: 9, length_in: 20.5 })).toEqual(app.payload);
  });

  it("diaper: identical, with words people say mapped to the stored values", () => {
    expect(diaper({ contents: "mixed", pee_size: "big", poo_size: "little", rash: true })).toEqual(
      diaperPayload("both", { pee_amount: "large", poo_amount: "small", rash: "yes" }, false)
    );
  });
});

describe("connector refuses what should not be saved", () => {
  it("a breast feed with no sides", () => {
    expect(() => breastFeed(start, 0, undefined)).toThrow(BuildError);
  });

  it("a poo size on a wet-only diaper is dropped, not saved", () => {
    expect(diaper({ contents: "pee", poo_size: "big" })).toEqual({ contents: "pee" });
  });

  it("16 oz or more", () => {
    expect(() => growth({ weight_lb: 7, weight_oz: 16 })).toThrow(BuildError);
  });

  it("evidence without sources, or with a non-https source", () => {
    expect(() => citations([])).toThrow(BuildError);
    expect(() => citations([{ title: "x", url: "http://example.com" }])).toThrow(BuildError);
    expect(citations([{ title: "AAP", url: "https://aap.org", pmid: 123 }])).toEqual([
      { title: "AAP", url: "https://aap.org", pmid: "123" },
    ]);
  });
});
