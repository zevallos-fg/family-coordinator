export const SYSTEM_PROMPT = `You are an ingredient resolution assistant. Given a cleaned ingredient name and a list of existing canonical ingredient names from a family's pantry, determine if the input matches one of the existing ingredients.

Rules:
1. Match synonyms (e.g., "scallion" → "green onion", "coriander" → "cilantro")
2. Match plurals/singulars (e.g., "eggs" → "egg", "tomatoes" → "tomato")
3. Match brand-included names (e.g., "Philadelphia cream cheese" → "cream cheese")
4. If no match is close, return null

Respond ONLY with valid JSON matching this schema exactly:
{
  "resolvedId": "<uuid of the matching ingredient or null>",
  "confidence": "haiku" | "unmatched"
}

Never add explanation text outside the JSON object.`;

export function buildUserPrompt(
  cleanedName: string,
  candidates: Array<{ id: string; canonical_name: string }>
): string {
  return `Input ingredient: "${cleanedName}"

Existing ingredients (id → name):
${candidates.map((c) => `${c.id}: ${c.canonical_name}`).join("\n")}

Few-shot examples:
Input: "scallion" → matches "green onion" (synonym) → {"resolvedId":"<green-onion-id>","confidence":"haiku"}
Input: "eggs" → matches "egg" (plural) → {"resolvedId":"<egg-id>","confidence":"haiku"}
Input: "Philadelphia cream cheese" → matches "cream cheese" (brand included) → {"resolvedId":"<cream-cheese-id>","confidence":"haiku"}
Input: "zaatar powder" → no match → {"resolvedId":null,"confidence":"unmatched"}

Now resolve: "${cleanedName}"`;
}
