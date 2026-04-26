# P3 Design Spec — F8 Weekly Digest Structured Render

## Storage change (actions.ts)

Store `content` as JSON: `JSON.stringify({ summary, sections, load_attribution })`
Keeps `blind_spots` as separate jsonb column (already correct).

## Layout flow

1. **Summary** — `<p>` prose block
2. **Sections** — cascading section cards (only `data_present: true`)
3. **Blind spots** — existing amber cards (unchanged)
4. **Load attribution chart** — horizontal bar chart
5. **Actions** — existing "not sent yet" note (unchanged)

## Sections rendering

Each `section` where `data_present: true`:
- `<section>` wrapper with `border border-stone-100 rounded-xl p-4`
- `<h2>` for title (`text-sm font-semibold text-stone-700`)
- `<p>` for body (`text-sm text-stone-600 mt-1`)
- Sections with `data_present: false`: skip entirely, no empty state

## Load attribution chart

Simple inline bar chart (no library):
- Container: `space-y-2`
- Per-member row: `flex items-center gap-3`
  - Member name: `text-xs text-stone-600 w-24 truncate`
  - Bar: `flex-1 bg-stone-100 rounded-full h-2` outer, `bg-amber-500 h-2 rounded-full` inner at `{width: pct%}`
  - Count: `text-xs text-stone-500 w-8 text-right`
- `pct = member.action_count / max_action_count * 100` (max across all members)
- Below bars: `observation` as `text-xs text-stone-500 italic mt-2`

## Markdown handling

Body text in sections is already plain prose (not markdown). Render as `<p>` with `whitespace-pre-wrap`. No markdown library needed.

## Backwards compat

JSON.parse wrapped in try-catch. If parse fails (should never happen with 0 rows): fall through to raw `<pre>` rendering as before.
