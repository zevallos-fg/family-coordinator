# T5 — Caregiver Hub Design Spec

Generated: 2026-04-19 | Track: wave1/t5-caregiver-hub

---

## The Problem

Parents hand their kid to a nanny, grandparent, or daycare and need to communicate ~20 things:
sleep quality, food preferences, current mood, what's in the bag, what happened yesterday.
They end up texting rambling context mid-morning. The caregiver misses things.

T5 makes that handoff legible, fast, and AI-authored.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Brief generation trigger | **Manual "Generate Brief" button** | Cron needs reliable shift times (wave 1 families won't be consistent). Manual is a deliberate "I'm handing off" ritual. Auto-gen is T6. |
| Caregiver auth | **None** | Grandparents will not create accounts. Brief is at a shareable URL, token = shift_id. POSTBUILD: HMAC-signed tokens. |
| Recap input | **Text textarea only** | Voice is a larger lift; "he ate well, napped 2 hrs" typed is sufficient for MVP. Voice is a fast-follow. |
| Kid state storage | **kids.notes + food_favorites[] + food_aversions[]** | Schema has no JSONB blob. `notes` stores rolling AI-maintained text. Arrays handle food state. No migration needed. |
| Kid required before brief | **Yes — gate on kids existing** | Brief is useless without a child to reference. Show empty state with "Add a child first" CTA. |
| Quick brief fast path | **3-field modal on hub landing** | Parent forgets to schedule at 7:45am with nanny arriving at 8. Must work in <60 seconds. |
| Caregiver-view priority | **Design for grandparent first** | Computer-averse grandparents on iPhone 6 are the hardest user. If it works for them, it works for everyone. |

---

## Three Core Flows

### Flow 1: Setup (one-time, ~5 min)
```
/caregiver
  → Add caregivers (name, role, phone/email/notes)
  → Add kids (name, birthdate, notes, food_favorites, food_aversions)
  → Hub ready
```

### Flow 2: Morning Handoff (daily, ~2–3 min)
```
/caregiver
  → "Quick Brief" modal (if rushed) OR "New Shift" for full scheduling
  → Pick caregiver + kids + time
  → /caregiver/shifts/[id]
  → Click "Generate Brief" → AI writes warm markdown brief
  → "Share with [name]" → copies URL /caregiver-view/[shift_id]
  → Parent texts/WhatsApps URL to caregiver
  → Caregiver opens URL (no login, mobile-optimized, large text)
  → Reads brief on phone
```

### Flow 3: Evening Recap (daily, ~1 min)
```
Caregiver → same /caregiver-view/[shift_id] URL
  → "How did it go?" textarea
  → Submit → AI parses → shift_recaps row written
  → Full-screen success state ("Fernando & Yenny have been notified. Thank you!")
  → Idempotent: second visit shows recap as read-only, no re-submit
  → Parent sees recap on /caregiver/shifts/[id]
  → Kid notes updated via family-kid-state skill (best-effort; failure logged in POSTBUILD warning)
```

---

## Hub Landing Page (`/caregiver`)

Three sections:

**1. Today / Upcoming Shifts**
- One card per shift: caregiver name, kid names, time range
- Status chip: `No brief` / `Brief ready` / `Recap submitted`
- Inline CTAs: "Generate Brief" or "View Brief"
- "Quick Brief" button (top right) — opens 3-field modal

**2. Caregivers**
- Card per caregiver: name, role badge, phone/email
- "Add Caregiver" button

**3. Kids**
- Card per kid: name, age derived from birthdate
- First 60 chars of `notes` as preview
- "Update" → kid state form

**Empty state (no kids):** "Add Leo to get started" CTA before any shift creation is available.

---

## Caregiver-View Page (`/caregiver-view/[shift_id]`)

**Priority: design for grandparent on iPhone 6.**

Requirements:
- `text-lg` minimum for brief body
- No navigation, no app chrome — just the content
- Loads fast (SSR, no client-side JS required for reading)
- Single textarea + single large submit button for recap
- **Full-screen success state after submit** — green check, large text, caregiver's name, "Fernando & Yenny have been notified."
- Idempotent: if recap already submitted, show it read-only

Content layout:
```
Good morning, Rosa 👋

Today you have Leo · Monday, April 19 · 8am – 5pm

━━━━━━━━━━━━━━━━━━━

[AI-generated brief content in markdown — warm, readable]

━━━━━━━━━━━━━━━━━━━

How did it go today?
[textarea]
[Submit recap]
```

---

## Kid State (given actual schema)

No JSONB blob. We use three fields on `kids`:

| Field | What it stores |
|---|---|
| `notes` | Rolling AI-maintained text: sleep patterns, in-flight issues, current personality, recent highlights |
| `food_favorites[]` | What they love right now |
| `food_aversions[]` | What they refuse / allergies |

**family-kid-state skill** reads existing `notes` + arrays + new free-text observation →
returns updated `notes` text + updated `food_favorites[]` + updated `food_aversions[]`.

The brief skill reads all three and writes kid context into the brief.

---

## Brief Content Template

```markdown
Good morning, [Caregiver Name] 👋

**Today: [Day, Date] · [Start] – [End]**

---

## Right now, the most important thing
[Top of kid notes — AI extracts what's urgent]

## [Kid name]'s world this week
- **Loves:** [food_favorites, recent interests from notes]
- **Watch out for:** [food_aversions, in-flight issues]
- **Sleep lately:** [from notes]

## Today's schedule
[from schedule_entries — empty: "Nothing formal today — follow [kid]'s lead"]

## Open tasks / reminders
[from tasks — empty: "Nothing specific today"]

---

*Sent with love by Fernando & Yenny*
```

---

## Auth Exceptions

`/caregiver-view/*` routes are public — no auth check. Pages use the Supabase server client
to query by shift_id without requiring a session. No RLS issue because the query is read-only
on shift_briefs (which has no sensitive data beyond kid names + schedule).

Middleware already doesn't enforce auth (it only refreshes sessions). Pages enforce auth
themselves via `redirect("/login")`. Caregiver-view pages simply do not call that redirect.

---

## Schema Adaptations (vs. spec)

| Spec assumption | Actual schema | Adaptation |
|---|---|---|
| `kids.current_state` JSONB | Doesn't exist | Use `notes` + `food_favorites[]` + `food_aversions[]` |
| `caregiver_shifts.kid_id` FK | Doesn't exist — has `kid_names[]` | Brief queries kids by name match |
| `caregiver_shifts.status` | Doesn't exist | Derive status: no brief = pending, brief exists = ready, recap exists = complete |
| `shift_recaps.content` | Schema has `transcription` + `structured_log` | `transcription` = raw caregiver text, `structured_log` = parsed JSON |

---

## Deferred (POSTBUILD-T5)

- HMAC-signed brief tokens (currently uses shift_id directly)
- Email delivery of brief (T9)
- Push notification on recap submission (T9)
- Voice recap input
- Brief editing (regenerate instead)
- Caregiver login/accounts
- Kid age formatted as "3 yrs, 2 mos"
- Brief tone A/B variants

T5-DESIGN.md complete.
