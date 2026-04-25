export const DESCRIPTORS = new Set([
  "minced", "chopped", "sliced", "diced", "grated", "zested",
  "peeled", "crushed", "julienned", "shredded", "cubed",
  "halved", "quartered", "mashed", "pureed", "whipped",
  "softened", "melted", "chilled", "roasted", "toasted",
  "raw", "cooked", "fresh", "frozen", "dried", "freshly",
  "finely", "roughly", "thinly", "thickly", "coarsely",
]);

export interface StripResult {
  cleanedName: string;
  descriptors: string[];
}

/**
 * Strips culinary preparation descriptors from an ingredient name.
 *
 * Handles three patterns:
 *   1. "garlic, minced" — comma-separated descriptor suffix
 *   2. "finely chopped onion" — descriptor prefix(es) before the base noun
 *   3. "carrots julienned" — descriptor suffix(es) after the base noun
 *
 * Case-insensitive. Returns the cleaned base name (lowercased) and the
 * extracted descriptors array (lowercased, deduplicated, in encounter order).
 */
export function stripDescriptors(input: string): StripResult {
  if (!input.trim()) {
    return { cleanedName: "", descriptors: [] };
  }

  const descriptorsFound: string[] = [];

  // Normalize whitespace
  let text = input.trim();

  // Step 1: Handle comma-separated descriptor(s) after the primary name.
  // e.g. "garlic, minced"  "Garlic, MINCED and crushed"
  const commaIdx = text.indexOf(",");
  let basePart = text;
  let suffixPart = "";
  if (commaIdx !== -1) {
    basePart = text.slice(0, commaIdx).trim();
    suffixPart = text.slice(commaIdx + 1).trim();
  }

  // Extract descriptors from suffix (split by whitespace and "and")
  if (suffixPart) {
    const suffixTokens = suffixPart.toLowerCase().split(/[\s,]+and[\s,]+|[\s,]+/);
    for (const token of suffixTokens) {
      const t = token.trim();
      if (t && DESCRIPTORS.has(t)) {
        descriptorsFound.push(t);
      }
    }
  }

  // Step 2: Strip leading descriptor tokens from basePart
  let words = basePart.split(/\s+/);
  while (words.length > 1) {
    const firstLower = words[0].toLowerCase();
    if (DESCRIPTORS.has(firstLower)) {
      descriptorsFound.push(firstLower);
      words = words.slice(1);
    } else {
      break;
    }
  }

  // Step 3: Strip trailing descriptor tokens from basePart (only if no suffix was found)
  // e.g. "carrots julienned", "butter softened and melted"
  if (!suffixPart) {
    // Look for trailing descriptors, possibly separated by "and"
    let changed = true;
    while (changed && words.length > 1) {
      changed = false;
      const lastLower = words[words.length - 1].toLowerCase();
      if (DESCRIPTORS.has(lastLower)) {
        descriptorsFound.push(lastLower);
        words = words.slice(0, -1);
        changed = true;
        continue;
      }
      // Check for "...and melted" pattern: "and" is not a descriptor, skip it
      if (lastLower === "and" && words.length > 2) {
        const secondLastLower = words[words.length - 2].toLowerCase();
        if (DESCRIPTORS.has(secondLastLower)) {
          descriptorsFound.push(secondLastLower);
          words = words.slice(0, -2); // remove "and <descriptor>"
          changed = true;
        }
      }
    }
  }

  const cleanedName = words.join(" ").toLowerCase();

  // Deduplicate descriptors (preserve order)
  const seen = new Set<string>();
  const uniqueDescriptors: string[] = [];
  for (const d of descriptorsFound) {
    if (!seen.has(d)) {
      seen.add(d);
      uniqueDescriptors.push(d);
    }
  }

  return { cleanedName, descriptors: uniqueDescriptors };
}
