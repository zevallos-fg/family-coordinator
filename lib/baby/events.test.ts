import { describe, it, expect } from "vitest";
import { DETAIL_CHIPS, visibleChipGroups } from "./events";

const keys = (payload: Record<string, unknown>) =>
  visibleChipGroups("diaper", payload).map((g) => g.key);

describe("visibleChipGroups — diaper", () => {
  /**
   * The rule this file exists for. It is also covered end to end, but that spec
   * needs a live database and so does not run in CI — which would leave the one
   * behaviour that keeps a 3am change to one tap with no gate on the way in.
   */
  it("offers no consistency chip on a wet-only change", () => {
    expect(keys({ contents: "pee" })).not.toContain("consistency");
    expect(keys({ contents: "pee" })).not.toContain("poo_amount");
    // The one question a wet change does raise.
    expect(keys({ contents: "pee" })).toContain("pee_amount");
  });

  it("asks about poo, and only about poo, on a soiled change", () => {
    expect(keys({ contents: "poo" })).toEqual(["contents", "poo_amount", "consistency"]);
  });

  it("asks both amounts when there was both", () => {
    expect(keys({ contents: "both" })).toEqual([
      "contents",
      "pee_amount",
      "poo_amount",
      "consistency",
    ]);
  });

  it("asks nothing beyond the type on a dry change", () => {
    expect(keys({ contents: "dry" })).toEqual(["contents"]);
  });

  it("asks nothing beyond the type before the type is known", () => {
    // The tile logs first and refines after, so the payload really is empty for
    // the moment between the tap and the answer.
    expect(keys({})).toEqual(["contents"]);
  });
});

describe("visibleChipGroups — other types", () => {
  it("passes through groups that have no condition", () => {
    expect(visibleChipGroups("sleep", {})).toEqual(DETAIL_CHIPS.sleep);
    expect(visibleChipGroups("feed", {})).toEqual(DETAIL_CHIPS.feed);
  });

  it("returns nothing for a type with no chips rather than throwing", () => {
    // contraction and growth are real event types with no chip groups at all.
    expect(visibleChipGroups("contraction", {})).toEqual([]);
    expect(visibleChipGroups("growth", null)).toEqual([]);
  });
});
