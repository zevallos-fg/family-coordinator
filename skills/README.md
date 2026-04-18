\# Skills Catalog



Every AI capability in Family Coordinator is a \*\*skill\*\* — a narrow, testable, typed function that calls Claude via the Cloudflare Worker proxy and logs usage via the `fn\_skill\_record\_usage` RPC.



\## Rules



1\. \*\*Default model:\*\* Haiku 4.5 (`claude-haiku-4-5-20251001`)

2\. \*\*Sonnet-gated skills (only these three):\*\* `family-meal-planner`, `family-weekly-digest`, `family-document-qa`

3\. \*\*Every call routes through `callSkill()`\*\* in `/skills/\_lib/runner.ts` — never call the Worker directly.

4\. \*\*Every skill is a folder\*\* with four files:

&#x20;  - `index.ts` — exports `run()` function with typed input/output

&#x20;  - `prompt.ts` — exports system + user prompt templates

&#x20;  - `README.md` — what it does, example input/output, model tier

&#x20;  - `tests.ts` — at least one integration test



\## Security architecture



The skillRunner runs server-side using the \*\*authenticated user's\*\* Supabase session (NOT the service role key). Cost tracking goes through two SECURITY DEFINER RPC functions in the database:



\- `fn\_skill\_get\_monthly\_spend(family\_id)` — returns current month's spend in cents

\- `fn\_skill\_record\_usage(family\_id, user\_id, skill\_name, model, in\_tok, out\_tok, cost)` — logs a call



Both functions verify caller membership via `fn\_user\_in\_family(auth.uid())`. A compromised Next.js server cannot escalate beyond reading/writing `api\_usage` for families the attacker is signed in to.



\## Per-family budget



`PER\_FAMILY\_MONTHLY\_CAP\_CENTS = 1000` ($10/month) enforced in `runner.ts`. Exceeding triggers a `budget\_exceeded` error with no API call made. Defense in depth: `fn\_skill\_record\_usage` also rejects single calls over $5.



\## Skill catalog



| Skill | Tier | Track | Purpose |

|---|---|---|---|

| family-capture-router | haiku | T2 | Mental Dump → category + tab |

| family-grocery-parser | haiku | T2 | Capture → grocery items |

| family-schedule-reconciler | haiku (vision) | T2 | Calendar screenshots → duties |

| family-recipe-importer | haiku | T3 | URL → structured recipe |

| family-meal-planner | \*\*sonnet\*\* | T3 | Pantry + recipes → week + grocery delta |

| family-receipt-parser | haiku (vision) | T4 | Photo → items + prices |

| family-pantry-inference | haiku | T4 | Barcode → pantry entry |

| family-caregiver-brief | haiku | T5 | Calendar + tasks → morning brief |

| family-caregiver-recap | haiku | T5 | Voice → structured log |

| family-kid-state | haiku | T5 | Rolling state summary |

| family-weekly-digest | \*\*sonnet\*\* | T6 | Week's data → narrative + blind spots |

| family-blind-spot-detector | haiku | T6 | Task patterns → flags |

| family-vendor-memory | haiku | T6 | Natural language vendor recall |

| family-school-brief | haiku | T7 | School email → action items |

| family-expense-parser | haiku | T7 | Receipt → categorized expense |

| family-document-indexer | haiku | T8 | Doc OCR + tag extraction |

| family-document-qa | \*\*sonnet\*\* | T8 | Multi-doc Q\&A |

| family-hurricane-prep | haiku | T8 | Miami-seasonal checklist |

| family-birthday-social | haiku | T8 | Party RSVP + gift reciprocity |

| family-kid-milestone | haiku | T8 | Pediatrician visit prep |

| family-travel | haiku | T8 | Trip → packing + house prep |

| family-caregiver-employment | haiku | T8 | Timesheet + mileage |



\## Adding a new skill



1\. Create folder `/skills/{skill-name}/`

2\. Drop in `index.ts`, `prompt.ts`, `README.m

