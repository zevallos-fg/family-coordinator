# family-schedule-reconciler

**Track:** T2
**Model tier:** haiku (vision)
**Purpose:** Calendar screenshots → weekly duty assignments (drop-off, pick-up, nap)

## How it works

1. User uploads a calendar screenshot showing the family's weekly schedule
2. Skill sends the image to Haiku with a structured prompt
3. Haiku extracts all events, ignoring red-colored items (Yenny's work shifts)
4. Duties are assigned per day based on availability windows

## Duty windows (from v8.4)

| Duty | Window |
|------|--------|
| Drop-off | 9:00 – 9:30 AM |
| Pick-up | 12:30 – 1:00 PM |
| Nap | 1:30 – 2:00 PM |

## Color rules

- **Red events**: Ignored entirely — these are Yenny's work shifts, not to be reassigned
- **All other colors** (blue, green, purple, gray, white, teal): Extracted and included

## Input

```typescript
{
  imageBase64: string;       // JPEG or PNG calendar screenshot (base64)
  imageMimeType: "image/jpeg" | "image/png";
  weekOf: string;            // ISO date of Monday (e.g. "2025-03-03")
  knownNames: string[];      // ["Fernando", "Yenny"]
}
```

## Output

```typescript
{
  days: Array<{
    date: string;            // ISO date
    duties: {
      dropoff: { assignee: string; confidence: number };
      pickup: { assignee: string; confidence: number };
      nap?: { assignee: string; confidence: number };  // optional
    };
    events: Array<{
      title: string;
      startTime: string;     // HH:MM (24-hour)
      endTime: string;
      color: string;
      assignee: string | null;
      ignored: boolean;      // true for red events
    }>;
  }>;
}
```

## Example

Input: Fernando's and Yenny's shared Google Calendar screenshot for the week of Mar 3

Output:
```json
{
  "days": [
    {
      "date": "2025-03-03",
      "duties": {
        "dropoff": { "assignee": "Fernando", "confidence": 0.9 },
        "pickup": { "assignee": "Yenny", "confidence": 0.8 },
        "nap": { "assignee": "Fernando", "confidence": 0.85 }
      },
      "events": [
        {
          "title": "Standup",
          "startTime": "09:00",
          "endTime": "09:30",
          "color": "blue",
          "assignee": "Fernando",
          "ignored": false
        }
      ]
    }
  ]
}
```

## Cost estimate

- Input: ~500–800 tokens (image tokens vary by resolution)
- Output: ~300–600 tokens
- Haiku pricing: ~$0.25/1M input, $1.25/1M output
- Estimated per call: **$0.001–0.003**

## POSTBUILD notes

- v8.4 uses TWO separate images (one per parent). This skill accepts ONE image.
  Recommend updating Input to `images: Array<{base64, mimeType, personName}>` in a future wave.
- Assignment logic is fully in the LLM — no local computation. Consider adding local validation of duty windows.
