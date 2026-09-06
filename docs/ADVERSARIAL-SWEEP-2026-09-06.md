# Adversarial sweep — 6 September 2026

Findings only. **Nothing in this pass was fixed**, deliberately: a sweep that
repairs as it goes cannot tell you how bad things were.

## Method

The app was driven signed in as the Playwright fixture user, against the fixture
family, at a phone viewport (390×844), on `main` at `0c96488`, served from a
production build.

- **46 routes with representative data.** The fixture family was seeded with 29
  rows across 24 tables — groceries, a store, captures, a chore, a task, a kid, a
  caregiver and a shift, a recipe with an ingredient, a meal plan and entry, a
  schedule duty, a document, an expense, a vendor with a service, a trip with a
  packing item, a checklist item and a digest — plus every detail route those
  rows made reachable, and two deliberately non-existent ids.
- **37 routes with an empty family**, after wiping every seeded row.
- **Console, page errors and every HTTP response ≥ 400** collected per route, not
  assumed.
- **Six interaction probes** that click a real control and then read the database
  to see whether anything was written.
- **Every `CHECK (… = ANY (…))` constraint in the schema** compared against the
  string literals the application writes.

Afterwards the fixture family was returned to zero rows in all 24 tables and
`default_serves` reset to its column default. The Zevallos family was never
touched, and its counts were identical before and after: 76 open grocery items,
13 recipes, 155 recipe ingredients, 3 chores, 1 kid, 1 caregiver, 0 baby events.

---

# Findings, ranked

## 1. "Add caregiver" crashes the page for every role

`createCaregiver` title-cases the role before inserting it:

```ts
// app/(app)/caregiver/actions.ts:46
role: toTitleCase(role.trim()),
```

`nanny` becomes `Nanny`. The column's constraint is
`role = ANY (ARRAY['nanny','grandparent','daycare','other'])` — exact, lowercase.
Every insert is rejected, and line 52 is `if (error) throw new Error(...)`, which
inside a Server Action produces the generic crash screen rather than a message.

Verified end to end: submitting the form left `caregivers` at 1 row and rendered
*"This page couldn't load — A server error occurred. Reload to try again."* with
a React Server Components render error in the console.

Direct probes: `Nanny`, `Grandparent`, `Daycare`, `Other`, `Au Pair`, `Au_pair`
all **rejected**; `nanny` accepted.

Separately, `components/caregiver/CaregiverForm.tsx:11` offers
`{ value: "au_pair", label: "Au Pair" }` — a value the constraint does not allow
at all, so that option would fail even without the title-casing.

Editing an existing caregiver uses `.trim()` without `toTitleCase` and is fine,
which is why the feature looks like it works from the list page.

## 2. Hurricane prep cannot write anything

The constraint is `status = ANY (ARRAY['open','done','na'])`. The feature writes
`'pending'`, `'completed'` and `'n_a'`:

- `app/(app)/hurricane/actions.ts:88` — inserts every generated item with
  `status: "pending"` → **rejected**, so generation cannot store a checklist.
- `:116` — ticking an item writes `status: "completed"` → **rejected**.
- `:138` — marking N/A writes `status: "n_a"` → **rejected**.
- `:186`, `:188` and `page.tsx:52-53` compute progress by counting
  `status === "completed" || status === "n_a"` — values the database can never
  hold, so both percentages are pinned at 0 and 100 respectively regardless.
- `components/hurricane/HurricaneChecklist.tsx:67,75,105` sets the same values in
  local state, so the UI ticks optimistically and the write is refused behind it.

Both writes confirmed rejected by direct probe. The Generate button does surface
a failure today (*"Could not generate checklist."*), but it is failing on the
Anthropic key first — the constraint is the wall behind that one.

## 3. Logging a medical event is impossible

`components/kids/MedicalEventForm.tsx:7-17` offers nine options: *Well-child
visit, Sick visit, Vaccination, Dental checkup, Eye exam, Specialist visit, ER
visit, Surgery, Other.*

The constraint is
`event_type = ANY (ARRAY['checkup','illness','vaccine','question','other'])`.
**None of the nine match.** Every submission is refused.

Verified: `medical_events` stayed at 1 row and the page rendered *"Could not save
medical event."* The action checks its error properly, so this one fails loudly —
it is simply always broken.

## 4. Trip prep tasks are dropped without a word

```ts
// app/(app)/trips/actions.ts:101
status: "pending",
...
// :105-107
if (prepTasks.length > 0) {
  await supabase.from("tasks").insert(prepTasks);   // result never inspected
}
```

`tasks.status` allows `open | in_progress | done | cancelled`. `'pending'` is
**rejected** (probe confirmed; `'open'` accepted). The insert's error is never
read, so the trip saves, the packing list saves, `revalidatePath` runs, the user
is told the trip was planned — and every prep task is silently gone.

This is currently masked: the skill call fails on the invalid Anthropic key
before reaching this block. **It will begin losing data the day the key works.**

## 5. Digest blind-spot → task is broken the same way

`app/(app)/digest/actions.ts:274` inserts a task with `status: "pending"`. Same
rejection. This one does check the error and returns *"Could not create task."*,
so it is broken but visible.

## 6. From Friday to Sunday, "this week" sections show next week and call
themselves empty

`defaultPlanWeek` returns *next* Monday on Fri, Sat and Sun — deliberate
"planning mode". The copy around it was not updated to match.

Observed live on Sunday 6 September, with a shift running that afternoon:

- `/caregiver/shifts` correctly listed *SWEEP Nanny · Sun, Sep 6, 3:27 PM*.
- `/caregiver` rendered the heading **"Shifts this week"** over the range
  *Sep 7 — 13* and the sentence **"No shifts scheduled for this week."**
- `/meal-plans` said **"No meal plan yet for this week"** while a plan existed
  for the week that actually contains today.
- `/schedule` said **"No schedule for this week yet"** with a duty on today.

Three days in seven, the hub tells you nothing is happening on a day when
something is. The week jump may well be right; calling the result "this week" is
not. (`components/ui/WeekPicker.tsx` is clean — its "This week" is a button
label, not a claim about the range.)

## 7. `/documents/[id]` has a loading state with no way out

A document whose indexing never completed renders *"INDEXED — Indexing in
progress…"* permanently (`app/(app)/documents/[id]/page.tsx:92`). The **list**
page has a retry path (`triggerIndexing`, `DocumentVaultView.tsx:117`); the
detail page has none. Probed: with `indexed_at = null`, the only visible button
on the page was "More" in the nav.

## 8. `/caregiver-view/[token]` uses the raw shift UUID as its token

`app/caregiver-view/[token]/page.tsx:20` looks the shift up by `id = token`.
Public, unauthenticated, no expiry, no revocation — and the identical id sits in
the family's own `/caregiver/shifts/<id>` URL, so any shared screenshot or copied
link is a permanent public link to that shift's brief and recap. There is a
`// POSTBUILD: Replace with HMAC-signed tokens.` note at line 10 acknowledging it.

Worth contrasting with `baby_share_links`, which has a 256-bit token, an expiry
and a revoke.

## 9. Hydration error on `/capture/new`, every single load

```
pageerror: Minified React error #418 (…args[]=HTML)
```

`VoiceButton` computes `SR` from `window` during render and returns `null` when
there is no `window` — so the server renders nothing and the client renders a
button. React discards the server HTML for that subtree and re-renders it on the
client.

Present on both sweeps. It is the only page error found anywhere in the app.
Note that **PR #7 does not fix this** — it preserves the pattern. (The new
quick-capture sheet is unaffected, because it only ever mounts after a click and
so is never server-rendered.)

## 10. `/barcode` is unreachable

The route builds and renders, and nothing in `app/` or `components/` links to it —
not `MobileNav`, not `TopNav`, not any page. It can only be reached by typing the
URL. Either wire it up or delete it.

## 11. `vendors.last_used_at` is maintained only by the app action

Logging a service through the UI does update it (probed: `null` →
`2026-09-06`). But it is a denormalised column with no trigger behind it, so a
`vendor_services` row created any other way — an import, Claude chat, the MCP
worker — leaves it stale. Reproduced by seeding a service directly: the vendor
page read **"LAST USED — Never"** directly above a service history entry dated
8/6/2026.

## 12. Another family's child is named in shared copy

- `app/(app)/schedule/page.tsx:53` — "Leo's care duties by week"
- `app/(app)/schedule/upload/page.tsx:29` — "assign Leo's care duties for each day"
- `app/(app)/kids/[id]/milestones/page.tsx:91` — "Use the form above to log Leo's
  first milestone."

These render for every family regardless of who their children are — the fixture
family, which has no Leo, sees all three. Placeholders such as `e.g. Leo` in form
inputs are fine and are not included here.

## 13. Hardcoded "Miami, FL" on `/hurricane`

`app/(app)/hurricane/page.tsx:61`. `families.city` exists in the schema and is
not read anywhere.

## 14. "1 transactions"

`components/expenses/ExpenseView.tsx:90` — `{expenses.length} transactions` with
no singular form.

## 15. Two age formatters, two answers

`/kids` renders "2 years"; `/caregiver/kids` renders "2 yrs, 7 mo" — for the same
child on the same day.

## 16. Cosmetic string joins

- Recipe detail: `Sweep Flour— 2 cup` — no space before the dash, unit not
  pluralised.
- Trip detail: `SWEEP sunscreenShared Essentials` — two adjacent elements with no
  separator.

---

# What came back clean

Worth stating plainly, because most of the app did.

- **No 500s and no unhandled crashes on any route**, in either data state, apart
  from finding 1's action.
- **Missing ids 404 correctly** to the app's own not-found page — probed with two
  fabricated UUIDs.
- **Every route renders a sensible empty state with an empty family.** All 37
  checked; none showed a spinner, a bare screen, or an error where "nothing yet"
  was the truth.
- **The console is silent on 44 of 46 routes.** The only entries were finding 9
  and the two deliberate 404s.
- **Writes that claim to have happened, happened.** Probed and confirmed against
  the database: `/organized` "Done" (open captures 2 → 1), `/settings` servings
  (wrote `default_serves`), `/grocery` add, `/expenses` "+ Manual" (opens a real
  form with four inputs), `/vendors` "Log service".
- **Skill failures are loud.** `/hurricane` "Generate" returned *"Could not
  generate checklist."* rather than pretending — PR #5's error surfacing doing its
  job against the still-invalid production key.
- **No dead handlers.** No `onClick={() => {}}`, no `href="#"`, and no
  "coming soon" placeholders outside the two acknowledged POSTBUILD notes.

# What this sweep did not cover

- Unauthenticated flows: `/login`, `/onboarding`, `/invite/[token]`. The session
  was authenticated throughout; `auth-guard.spec.ts` covers the redirects.
- The desktop `TopNav`. Everything ran at a phone viewport.
- Upload paths for receipts and documents, which need real files through the
  storage bucket.
- The skill-backed generate buttons beyond observing that they fail loudly —
  `/digest`, `/trips` packing, caregiver briefs, milestone analysis. The
  production Anthropic key is still invalid, so none of them can complete. Their
  success paths are untested by this pass, and finding 4 lives in one of them.
- The two open pull requests. This sweep ran against `main`, so the baby lane
  (#6) and the one-tap mic (#7) are not represented, except where noted.
