# family-caregiver-brief

**Track:** T5 | **Model:** Haiku | **Cost:** ~$0.003/call

Generates a warm, actionable morning brief for a caregiver given shift context, kid profiles, open tasks, and an optional previous recap.

## Input

```typescript
{
  caregiver: { name: string; role: string };
  kids: Array<{
    name: string;
    birthDate: string | null;
    notes: string;
    foodFavorites: string[];
    foodAversions: string[];
  }>;
  shift: { startAt: string; endAt: string };   // ISO timestamps
  openTasks: Array<{ title: string; dueDate?: string }>;
  previousRecap?: string;  // last caregiver recap text for continuity
}
```

## Output

```typescript
{
  content: string;  // Markdown-formatted brief
}
```

## Example output

```markdown
Good morning, Rosa! 👋

**Today: Monday, April 19 · 8:00 AM – 5:00 PM**

---

## Heads up

Leo skipped his nap yesterday afternoon, so watch for crankiness around 2pm.

## Leo's world right now

- **Loves:** blueberries, dinosaurs, his red truck
- **Watch out for:** broccoli

---

*Lots of love, Fernando & Yenny* 💛
```

## Notes

- Brief is stored in `shift_briefs.content` and served at `/caregiver-view/[shift_id]`
- Parents trigger generation via "Generate brief" button on shift detail page
- No schedule_entries integration in Wave 1 (T2 owns that table)
