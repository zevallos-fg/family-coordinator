# family-kid-state

**Track:** T5 | **Model:** Haiku | **Cost:** ~$0.001/call

Merges a new observation about a child into their rolling profile stored in the `kids` table.

## Input

```typescript
{
  kidName: string;
  currentNotes: string;           // from kids.notes
  currentFoodFavorites: string[]; // from kids.food_favorites
  currentFoodAversions: string[]; // from kids.food_aversions
  newObservation: string;         // free-form text from parent
  observationDate: string;        // ISO date (YYYY-MM-DD)
}
```

## Output

```typescript
{
  updatedNotes: string;           // 3-6 bullet point snapshot
  updatedFoodFavorites: string[]; // deduped, max 10
  updatedFoodAversions: string[]; // deduped, max 10
  summary: string;                // 1-2 sentence description of what changed
}
```

## Merge logic

- Food observations → update `food_favorites`/`food_aversions` arrays
- Negations ("used to hate X, now loves it") → move between arrays
- Behavioral/ongoing notes → update `notes` text (keeps most recent state, drops stale)
- Passing events → add to notes as bullet point if notable

## Called from

- `updateKidFromObservation` server action (parent enters observation manually)
- `parseRecap` server action (after caregiver recap is submitted and parent parses it)
