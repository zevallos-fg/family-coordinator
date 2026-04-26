# P3 Investigation — F8 Weekly Digest

## digests table columns

```
id                uuid
family_id         uuid
week_start_date   date
content           text       ← stores markdown today; will store JSON after fix
blind_spots       jsonb      ← already structured, unchanged
sent_at           timestamptz
created_at        timestamptz
```

NO `sections` or `load_attribution` columns exist.

## How the action currently persists data

In `app/(app)/digest/actions.ts` line 167-184:
1. Extracts `{ summary, sections, blind_spots, load_attribution }` from skill output
2. Builds markdown string: `content = "# Weekly Digest…\n{summary}\n## {section.title}\n{section.body}…"`
3. Inserts: `content` (markdown text) + `blind_spots` (jsonb array)
4. `sections` and `load_attribution` are **dropped** — not persisted

## Fix strategy (NO migration required)

0 rows in `digests` table — no backwards compatibility needed.

Change:
- `content` column stores `JSON.stringify({ summary, sections, load_attribution })` instead of markdown
- `blind_spots` column unchanged (still separate jsonb)
- Render layer parses `content` JSON → renders structured sections + bar chart

This uses existing `content text` column (can hold any string including JSON).

## DigestView current state

- Renders `selectedDigest.content` as `<pre className="whitespace-pre-wrap">` (raw markdown blob) ✅
- Renders `blind_spots[]` as amber cards with "Convert to task" button ✅
- `sections[]` rendering: NOT implemented ❌
- `load_attribution` rendering: dead-code marker `{(() => { return null; })()}` ❌
