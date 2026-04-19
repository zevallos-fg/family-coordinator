# family-caregiver-recap

**Track:** T5 | **Model:** Haiku | **Cost:** ~$0.002/call

Parses a caregiver's free-text recap into structured data and a summary for parents.

## Input

```typescript
{
  kidName: string;
  shiftTimes: { startAt: string; endAt: string };
  caregiverText: string;  // free-form text from caregiver
}
```

## Output

```typescript
{
  summary: string;  // 2-3 sentences for parents
  structuredData: {
    sleep?: { napStart?: string; napEnd?: string; durationMin?: number; quality?: string };
    meals?: Array<{ time?: string; description: string; amountEaten?: "all"|"some"|"none" }>;
    moodEvents?: Array<{ time?: string; description: string }>;
    health?: { symptoms?: string[]; medications?: Array<{...}> };
    other?: string[];
  };
  parentsShouldKnow: string[];  // urgent items, up to 3
}
```

## Flow

1. Caregiver visits `/caregiver-view/[shift_id]` and submits text
2. Recap is saved immediately as `shift_recaps.transcription`
3. Parent views shift detail and clicks "Parse & update kid notes"
4. This action calls `family-caregiver-recap` + `family-kid-state` in sequence

## Notes

- Parsing is parent-triggered (not automatic) due to auth constraints on caregiver-view
- Parsed result stored in `shift_recaps.structured_log` (JSONB)
- POSTBUILD: Auto-parse on submission via background job
