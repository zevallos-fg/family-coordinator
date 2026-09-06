# Swallowed errors — 6 September 2026

Report only. **Nothing here is fixed**, as instructed.

## The shape

An error, coerced into a plausible empty result, so the failure is
indistinguishable from a quiet day. Three instances surfaced this week before
this sweep:

1. **The Anthropic proxy** returned HTTP 200 wrapping Anthropic's error body, so
   `response.ok` was true and `usage.input_tokens ?? 0` read 0. Four and a half
   months of silent outage, 7 tidy zero-token rows in `api_usage`, no
   `error_message` on any of them.
2. **`/fetch-html`** returned a paywall page as a success.
3. **`digest/actions.ts`** filtered `caregiver_shifts` on `shift_date`, a column
   that has never existed. PostgREST returned an error; `?? []` turned it into
   "no shifts this week", every week.

The first two were fixed. The third is what prompted this.

## The count

Scanned every `.from(...)` and `.rpc(...)` read in `app/`, `components/`, `lib/`
and `skills/`, matched to its destructuring pattern, then asked two questions of
each: is the returned `error` ever referenced, and is the returned `data`
coalesced with `?? []` / `?? null` / `?? 0` / `?? {}`.

| | count |
|---|---|
| Supabase reads found | **269** |
| **Coalesced, and the error is never read** | **37** ← an error becomes an empty state |
| Coalesced, and the error *is* read | 11 |
| Not coalesced | 221 |
| …of which the error is never read | 155 |

**37 is the direct answer to the question.** Every one turns a failed read into an
empty result that the surrounding code treats as true.

The 155 deserve a sentence, because they are the same failure mode wearing a
different disguise: `const { data: shift } = await …; if (!shift) notFound()`.
A failed read there does not become an empty list, it becomes a 404 — which is
the bug in `/caregiver-view/[token]` exactly. They are out of scope for this
report but they are not out of scope for the problem.

## Ranked, by what the swallowed error actually causes

### Tier 1 — a failed read becomes wrong data that is written, or money spent (15)

These are the `shift_date` shape. The read fails, the empty default flows into a
paid model call or a database write, and the result looks entirely normal.

| Site | What a failed read produces |
|---|---|
| `digest/actions.ts:51` ×7 | The weekly digest is generated from "nothing happened" and **written to `digests`**. Already fixed in PR #9. |
| `caregiver/actions.ts:251` `kids` | A shift brief generated with **no kid state** — no allergies, no aversions, no notes — then stored in `shift_briefs` and handed to a caregiver. The worst one on this list. |
| `caregiver/actions.ts:266` `openTasks` | Same brief, with the day's tasks missing. |
| `meal-plans/actions.ts:483` `pantryRaw` | The planner believes the pantry is empty and **puts everything on the grocery list**, via a paid Sonnet call. |
| `meal-plans/actions.ts:558` `storeList` | Every grocery item from the plan is **written with no store**, silently undoing the store-resolution fix that comment above it describes. |
| `trips/actions.ts:57` `members` | A packing list generated for a household of **zero adults**, written to `trip_packing_items`. |
| `schedule/actions.ts:43` `members` | Worse than an empty default — it falls back to hardcoded `["Fernando", "Yenny"]` and **assigns duties by those names**, writing `schedule_entries` attributed to two people it guessed. |
| `capture/actions.ts:33` `categories` | The router is handed no categories, so everything lands in Uncategorized with `category_id: null`. |
| `lib/grocery/resolve-ingredient.ts:80` `allIngredients` | No fuzzy candidates, so the resolver **creates a duplicate ingredient row**. Compounds every time. |

### Tier 1.5 — a failed read reports a reassuring number (1)

`api/spend/route.ts:30` — a failed `fn_skill_get_monthly_spend` reports
**$0.00 of $10.00 spent**, and caches that for the TTL. A budget indicator that
fails toward "plenty left" is the wrong direction to fail in.

### Tier 2 — a failed read becomes a wrong screen (15)

Visible, recoverable on reload, no bad write. Still says "you have nothing" when
the truth is "I could not find out".

- `now/page.tsx:51` ×3 — renders **"Nothing needs you right now."**
- Twelve list and detail pages: `capture`, `caregiver/caregivers`,
  `caregiver/kids`, `caregiver/shifts`, `kids/birthdays`, `meal-plans/pantry`,
  `meal-plans/plan/[id]`, `receipts`, `receipts/[id]`, `schedule`, `trips/[id]`,
  `vendors/[id]`.

### Tier 3 — degraded but not wrong (6)

`meal-plans/actions.ts:371` (ingredient autocomplete returns nothing; retype),
`receipts/actions.ts:48` and `grocery/actions.ts:30` (no default store),
`kids/actions.ts:64` and `kids/birthday-actions.ts:98` (AI context thinner than
it should be), `api/dev/test-skill/route.ts:26` (dev-only).

## The 11 that get it right

Worth naming, because they are the pattern the other 37 should follow: the error
is checked first, and *then* `?? []` handles the genuinely-empty case. That
ordering is the whole distinction. `?? []` is not the bug — `?? []` **instead of**
reading the error is the bug.

## What I would do about it

Not doing it yet. But the shape of a fix, for when you want one:

1. **Tier 1 and 1.5 individually**, because each needs a decision about what to do
   instead — refuse to generate, return an error, or proceed and say so. Nine
   sites, nine judgements.
2. **Tier 2 as a batch**, since they share one answer: an `ErrorBanner` where the
   empty state currently goes. The component already exists.
3. **A lint rule** so the count cannot climb again. This scan is a heuristic over
   regexes; a `no-floating-supabase-error` rule over the AST would be exact, and
   would have caught all three of this week's instances before review.

The scanner used for this report is not committed — it is a throwaway. If a lint
rule is wanted, that is the thing worth building properly.
