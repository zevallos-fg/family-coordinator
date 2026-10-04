import { describe, expect, it } from "vitest";
import { diaperPayload } from "./diaper";

describe("diaperPayload", () => {
  it("keeps the details that apply", () => {
    expect(diaperPayload("both", { pee_amount: "small", poo_amount: "large", rash: "yes" }, false)).toEqual({
      contents: "both",
      pee_amount: "small",
      poo_amount: "large",
      rash: "yes",
    });
  });

  it("drops a poo answer when the choice was changed to pee", () => {
    expect(diaperPayload("pee", { poo_amount: "large", consistency: "loose", pee_amount: "medium" }, false)).toEqual({
      contents: "pee",
      pee_amount: "medium",
    });
  });

  it("skips cleared answers and marks potty", () => {
    expect(diaperPayload("dry", { rash: null }, true)).toEqual({ contents: "dry", potty: true });
  });
});
