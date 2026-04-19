# POSTBUILD-T5 — Caregiver Hub Deferred Items

---

## Security

### Brief URL uses shift_id directly as token
**Risk:** Medium. Anyone who guesses or intercepts a shift_id can view the brief and submit a recap. For a friends-and-family launch this is acceptable, but not for production.

**Fix:** Generate a separate `share_token` column on `caregiver_shifts` using `crypto.randomUUID()` or HMAC(shift_id, secret). Route becomes `/caregiver-view/[token]` where token != shift_id.

---

## Auth / Recap Parsing

### Recap parsing is parent-triggered, not automatic
**Why:** The caregiver submits the recap without auth. Skill calls require an authenticated user (runner verifies session). Background jobs with service role aren't allowed per `admin.ts` conventions.

**Current behavior:** Recap is saved as raw text immediately. Parent sees "Parse & update kid notes" button on shift detail.

**Fix options:**
- (Preferred) Add a Next.js API route that accepts the recap text with HMAC token, verifies it, then calls the skill via the family owner's stored refresh token.
- Or: T9 adds a message queue / webhook that triggers parsing when recap is submitted.

---

## UX

### Kid age formatted as "3 yrs, 2 mos"
`KidProfile.tsx` calculates age but doesn't handle the "just born" case (0 months edge case). Also no handling for future birthdates.

### Brief tone tuning
Prompt is good for MVP but may need adjustment based on feedback. Consider A/B variant prompts (POSTBUILD T6 territory).

### Brief content renders as `<pre>` not markdown
`/caregiver-view/[token]` renders brief with `<pre>` for MVP simplicity. Should use a markdown renderer (e.g., `react-markdown`) for proper heading hierarchy, bold, bullets. Impacts readability on mobile.

**Fix:** `npm install react-markdown` and replace `<pre>` with `<ReactMarkdown>` in caregiver-view page.

### ShiftForm kid selection uses JavaScript to build hidden input
The kid name checkboxes update a hidden `kid_names` input via inline onChange. This is slightly fragile — if JS is disabled, kid names won't submit. For MVP on authenticated parents this is fine.

### No shift editing
Once a shift is created, it can only be deleted. Add an edit page at `/caregiver/shifts/[id]/edit` for time/caregiver corrections.

---

## Data

### `kids.current_state` schema gap
The spec assumed a `current_state` JSONB column on `kids`. The actual schema uses `notes` (text) + `food_favorites[]` + `food_aversions[]`. This works well but loses some structure (e.g., no separate `inFlightIssues` vs `recentHighlights` separation). If richer state tracking is needed post-MVP, add a `current_state` JSONB column via migration.

### Recap structured_log is not surfaced to parents
`shift_recaps.structured_log` is written (when parsed) but only displayed raw as JSON in BriefPreview. A proper recap display component with sleep/meal/mood sections would improve the parent experience.

---

## Cross-track

### Schedule entries not integrated
`shift_briefs` could include schedule_entries for the shift day (doctor appointments, activities). T2 owns `schedule_entries`. For now, the brief just shows "No formal schedule today — follow [kid]'s lead."

**Fix:** In `generateBrief` server action, query `schedule_entries` table for events that overlap the shift window and pass them to the brief skill.

### Tasks not populated in Wave 1
`openTasks` in the brief comes from the `tasks` table, which has no data in Wave 1. The brief shows "no open tasks" gracefully. Will auto-populate when T2 populates tasks.

T5 POSTBUILD logged.
