export const SYSTEM_PROMPT = `You are a family care coordinator assistant. You parse a caregiver's free-text recap of a child's day into structured data.

Be generous in interpretation — caregivers write casually. Extract what you can, leave fields null/empty when information isn't mentioned.

Output valid JSON only. No markdown fences. No prose.`;

export function buildUserPrompt(input: {
  kidName: string;
  shiftTimes: { startAt: string; endAt: string };
  caregiverText: string;
}): string {
  return `Parse this caregiver recap for ${input.kidName}'s shift (${input.shiftTimes.startAt} – ${input.shiftTimes.endAt}).

Caregiver wrote:
"${input.caregiverText}"

Return JSON:
{
  "summary": "2–3 sentences for parents summarizing the day warmly",
  "structuredData": {
    "sleep": {
      "napStart": "HH:MM or null",
      "napEnd": "HH:MM or null",
      "durationMin": null,
      "quality": "good|fair|poor or null"
    },
    "meals": [
      {
        "time": "HH:MM or null",
        "description": "what they ate",
        "amountEaten": "all|some|none"
      }
    ],
    "moodEvents": [
      {
        "time": "HH:MM or null",
        "description": "brief description of mood or event"
      }
    ],
    "health": {
      "symptoms": [],
      "medications": []
    },
    "other": []
  },
  "parentsShouldKnow": ["urgent items max 3 short strings, empty array if nothing urgent"]
}`;
}
