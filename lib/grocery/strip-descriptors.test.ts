import { describe, it, expect } from "vitest";
import { stripDescriptors } from "./strip-descriptors";

describe("stripDescriptors", () => {
  it('strips single descriptor after comma: "garlic, minced"', () => {
    const result = stripDescriptors("garlic, minced");
    expect(result.cleanedName).toBe("garlic");
    expect(result.descriptors).toEqual(["minced"]);
  });

  it('strips adverb + descriptor from prefix: "finely chopped onion"', () => {
    const result = stripDescriptors("finely chopped onion");
    expect(result.cleanedName).toBe("onion");
    expect(result.descriptors).toContain("finely");
    expect(result.descriptors).toContain("chopped");
  });

  it('handles case-insensitive match with "and" separator: "Garlic, MINCED and crushed"', () => {
    const result = stripDescriptors("Garlic, MINCED and crushed");
    expect(result.cleanedName).toBe("garlic");
    expect(result.descriptors).toContain("minced");
    expect(result.descriptors).toContain("crushed");
  });

  it('strips multiple prefix descriptors: "freshly grated parmesan"', () => {
    const result = stripDescriptors("freshly grated parmesan");
    expect(result.cleanedName).toBe("parmesan");
    expect(result.descriptors).toContain("freshly");
    expect(result.descriptors).toContain("grated");
  });

  it('no false positives on non-descriptor words: "plain bread"', () => {
    const result = stripDescriptors("plain bread");
    expect(result.cleanedName).toBe("plain bread");
    expect(result.descriptors).toEqual([]);
  });

  it("handles empty string", () => {
    const result = stripDescriptors("");
    expect(result.cleanedName).toBe("");
    expect(result.descriptors).toEqual([]);
  });

  it('no descriptors present: "garlic"', () => {
    const result = stripDescriptors("garlic");
    expect(result.cleanedName).toBe("garlic");
    expect(result.descriptors).toEqual([]);
  });

  it('strips descriptor after comma with trailing words', () => {
    const result = stripDescriptors("onion, diced");
    expect(result.cleanedName).toBe("onion");
    expect(result.descriptors).toEqual(["diced"]);
  });

  it('handles trailing descriptor without comma: "carrots julienned"', () => {
    const result = stripDescriptors("carrots julienned");
    expect(result.cleanedName).toBe("carrots");
    expect(result.descriptors).toEqual(["julienned"]);
  });

  it('handles multiple trailing descriptors: "butter softened and melted"', () => {
    const result = stripDescriptors("butter softened and melted");
    expect(result.cleanedName).toBe("butter");
    expect(result.descriptors).toContain("softened");
    expect(result.descriptors).toContain("melted");
  });

  it('preserves compound names after stripping: "cheddar cheese, grated"', () => {
    const result = stripDescriptors("cheddar cheese, grated");
    expect(result.cleanedName).toBe("cheddar cheese");
    expect(result.descriptors).toEqual(["grated"]);
  });
});
