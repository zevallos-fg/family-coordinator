/**
 * Utilities for parsing LLM responses.
 * Used by any skill that expects structured JSON output.
 */

/**
 * Strips common LLM wrapper patterns from a response string and returns
 * the cleaned JSON text. Handles:
 *   - ```json\n{...}\n```
 *   - ```\n{...}\n```
 *   - Text prefixes/suffixes that the model sometimes adds despite instructions
 *
 * Does NOT parse — just cleans. Caller should JSON.parse() the result.
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();

  // Case 1: fenced block with optional language tag
  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenced?.[1]) return fenced[1].trim();

  // Case 2: response has prose before/after the JSON object
  // Find first { and last } and extract between them
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  // Case 3: looks like it's already clean JSON
  return trimmed;
}

/**
 * Parse LLM response text as JSON with fence/prose stripping.
 * Throws if the cleaned text isn't valid JSON.
 */
export function parseJsonResponse<T = unknown>(raw: string): T {
  return JSON.parse(extractJson(raw));
}