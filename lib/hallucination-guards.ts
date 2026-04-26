/**
 * Hallucination guards for skill outputs.
 * Used by hurricane-prep, document-qa, and weekly-digest skills.
 */

/**
 * Verify that every claimed entity ID exists in the provided actual entities array.
 * Returns ok: false and lists fabricated IDs if any don't match.
 */
export function verifyEntitiesExist<T extends { id: string; name?: string }>(
  claimedEntityIds: string[],
  actualEntities: T[]
): { ok: boolean; fabricated: string[] } {
  const actualIds = new Set(actualEntities.map((e) => e.id));
  const fabricated = claimedEntityIds.filter((id) => !actualIds.has(id));
  return { ok: fabricated.length === 0, fabricated };
}

/**
 * Verify that a claimed quote/passage appears as a substring of the corpus text.
 * Trims whitespace from the claimed quote before checking.
 */
export function verifySubstringInCorpus(
  claimedQuote: string,
  corpus: string
): { ok: boolean; cleanedQuote?: string } {
  const cleanedQuote = claimedQuote.trim();
  const ok = corpus.includes(cleanedQuote);
  return { ok, cleanedQuote: ok ? cleanedQuote : undefined };
}

/**
 * Extract ISO date strings (YYYY-MM-DD) and common date formats from text.
 */
export function extractDates(text: string): string[] {
  const patterns = [
    // ISO: 2026-04-25
    /\b\d{4}-\d{2}-\d{2}\b/g,
    // US: 04/25/2026 or 4/25/26
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    // Long form: April 25, 2026
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) found.push(...matches);
  }

  return [...new Set(found)];
}

/**
 * Extract dollar amounts (e.g. $12.34, $1,234.56) from text.
 */
export function extractAmounts(text: string): string[] {
  const pattern = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
  return [...new Set(text.match(pattern) ?? [])];
}
