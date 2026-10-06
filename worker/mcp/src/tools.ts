import { UserClient } from "./supabase";
import { BuildError, bottleFeed, breastFeed, citations, diaper, growth } from "./baby";
// Shared with the app so an event booked in chat starts with exactly the same
// sourced checklist as one added on the Plan screen.
import { starterItems } from "../../../lib/plan/events";
import type { EventKind } from "../../../lib/plan/templates";
// The same published thresholds and warning signs the app shows on /care.
import { BP_ACTION, bpBand, checkInWarnings, parseBp, type CheckIn } from "../../../lib/care/rules";
// Food and movement: the same sourced breastfeeding targets and the same
// validation as /care.
import {
  CALORIE_GUIDANCE,
  NUTRIENTS,
  NutritionError,
  SEAFOOD,
  SUPPLEMENT_NOTE,
  WEEKLY_MINUTES,
  RA_GUIDANCE,
  cleanNutrients,
  dayTotals,
  exerciseGate,
  foodPayload,
  localDate,
  localDayBounds,
  minutesSince,
  movePayload,
  progress,
  targetsFor,
  type FoodPayload,
  type MovePayload,
  type Nutrients,
} from "../../../lib/care/nutrition";

export class ToolError extends Error {}

const WRITTEN_BY = "claude_chat";

const SUBJECT_TYPES = ["kid", "adult", "caregiver", "household", "place", "vendor", "pet", "other"];
const CERTAINTIES = ["observed", "told", "inferred"];
const CORRECTION_TYPES = ["fact", "preference", "tone", "scope", "person", "timing"];

function str(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`${key} is required`);
    return "";
  }
  if (typeof v !== "string") throw new ToolError(`${key} must be a string`);
  return v.trim();
}

function oneOf(args: Record<string, unknown>, key: string, allowed: string[]): string {
  const v = str(args, key);
  if (!allowed.includes(v)) {
    throw new ToolError(`${key} must be one of: ${allowed.join(", ")} (got "${v}")`);
  }
  return v;
}

/**
 * A caller-supplied timestamp, never defaulted.
 *
 * The column comment on memory_facts.observed_at is the reason: it records WHEN
 * THE FACT BECAME TRUE, not when it was typed. Substituting now() would destroy
 * the only timing signal the row carries, so a missing value is an error and the
 * model is told to go and ask rather than guess.
 */
function requiredTimestamp(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    throw new ToolError(
      `${key} is required and is deliberately not defaulted to now(). It records when ` +
        `the thing actually happened, which is information only the user has. Ask them ` +
        `for it rather than substituting the current time.`
    );
  }
  if (typeof v !== "string") throw new ToolError(`${key} must be an ISO-8601 string`);
  const parsed = Date.parse(v);
  if (Number.isNaN(parsed)) throw new ToolError(`${key} is not a valid ISO-8601 timestamp: "${v}"`);
  return new Date(parsed).toISOString();
}

function optionalTimestamp(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ToolError(`${key} must be an ISO-8601 string`);
  const parsed = Date.parse(v);
  if (Number.isNaN(parsed)) throw new ToolError(`${key} is not a valid ISO-8601 timestamp: "${v}"`);
  return new Date(parsed).toISOString();
}

/** Resolve a person's name to a user id inside the caller's family, or fail loudly. */
async function resolveFamilyUser(db: UserClient, name: string): Promise<string> {
  // users RLS already limits this to people sharing a family with the caller.
  const people = await db.select<{ id: string; full_name: string | null }>(
    "users",
    "select=id,full_name"
  );
  const wanted = name.trim().toLowerCase();
  const hits = people.filter((p) => (p.full_name ?? "").trim().toLowerCase() === wanted);
  if (hits.length === 1) return hits[0].id;

  const known = people.map((p) => p.full_name).filter(Boolean).join(", ") || "(nobody visible)";
  if (hits.length === 0) {
    throw new ToolError(`no family member named "${name}". Known members: ${known}`);
  }
  throw new ToolError(`"${name}" matches more than one family member`);
}

/** Resolve a child's name inside the caller's family, or fail loudly with the names that exist. */
async function resolveKid(
  db: UserClient,
  familyId: string,
  name: string
): Promise<{ id: string; name: string; birth_date: string | null }> {
  const kids = await db.select<{ id: string; name: string; birth_date: string | null }>(
    "kids",
    `select=id,name,birth_date&family_id=eq.${familyId}`
  );
  const wanted = name.trim().toLowerCase();
  const hits = kids.filter((k) => k.name.trim().toLowerCase() === wanted);
  if (hits.length === 1) return hits[0];
  const known = kids.map((k) => k.name).join(", ") || "(no children recorded)";
  throw new ToolError(
    hits.length === 0 ? `no child named "${name}". Children: ${known}` : `"${name}" matches more than one child`
  );
}

/** A family member by first or full name, case-insensitive. */
async function resolvePerson(db: UserClient, name: string): Promise<{ id: string; name: string }> {
  const people = await db.select<{ id: string; full_name: string | null }>("users", "select=id,full_name");
  const wanted = name.trim().toLowerCase();
  const full = people.filter((p) => (p.full_name ?? "").trim().toLowerCase() === wanted);
  const firstName = people.filter((p) => (p.full_name ?? "").trim().toLowerCase().split(/\s+/)[0] === wanted);
  const hits = full.length ? full : firstName;
  if (hits.length === 1) return { id: hits[0].id, name: hits[0].full_name ?? name };
  const known = people.map((p) => p.full_name).filter(Boolean).join(", ") || "(nobody visible)";
  throw new ToolError(hits.length ? `"${name}" matches more than one person` : `no family member named "${name}". Known: ${known}`);
}

/** Builders throw BuildError for bad input; the model should see it as a tool error it can fix. */
function build<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof BuildError) throw new ToolError(e.message);
    throw e;
  }
}

const KID = { type: "string", description: "The child's first name, e.g. 'Evaluna'." };
const WHEN = (what: string) => ({
  type: "string",
  description: `ISO-8601 with offset. ${what} Required; ask if the user did not say. "Just now" means the current time.`,
});

export const TOOL_DEFINITIONS = [
  {
    name: "remember_fact",
    description:
      "Record something that is true about a person, place or the household. " +
      "observed_at must be when the fact became true, not now.",
    inputSchema: {
      type: "object",
      properties: {
        subject_type: { type: "string", enum: SUBJECT_TYPES },
        subject_label: { type: "string", description: "Who or what this is about, e.g. 'Mateo'" },
        fact_key: { type: "string", description: "Short stable key, e.g. 'shoe_size'" },
        fact_value: { type: "string" },
        observed_at: {
          type: "string",
          description:
            "ISO-8601. When the fact became true. Required; ask the user, never assume now.",
        },
        certainty: { type: "string", enum: CERTAINTIES },
        note: { type: "string" },
      },
      required: [
        "subject_type",
        "subject_label",
        "fact_key",
        "fact_value",
        "observed_at",
        "certainty",
      ],
    },
  },
  {
    name: "remember_decision",
    description: "Record a decision the family made. decided_at must be when it was decided.",
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string" },
        context: { type: "string" },
        decided_at: { type: "string", description: "ISO-8601. Required; when it was decided." },
        due_at: { type: "string", description: "ISO-8601, optional." },
        owner: { type: "string", description: "Full name of the family member who owns it." },
      },
      required: ["decision", "decided_at"],
    },
  },
  {
    name: "define_term",
    description: "Define a household term so it is not misread later.",
    inputSchema: {
      type: "object",
      properties: {
        term: { type: "string" },
        means: { type: "string" },
        never_assume: { type: "string", description: "The failure mode in words." },
        why_it_matters: { type: "string" },
      },
      required: ["term", "means"],
    },
  },
  {
    name: "record_correction",
    description:
      "Record that something believed was wrong. occurred_at is when the correction happened.",
    inputSchema: {
      type: "object",
      properties: {
        what_was_said: { type: "string" },
        what_is_true: { type: "string" },
        correction_type: { type: "string", enum: CORRECTION_TYPES },
        occurred_at: { type: "string", description: "ISO-8601. Required." },
      },
      required: ["what_was_said", "what_is_true", "correction_type", "occurred_at"],
    },
  },
  {
    name: "recall",
    description: "Search the family's memory: facts, decisions, terms and corrections.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "remember_task",
    description:
      "Record a one-off thing that has to be done by a date. Use this when there " +
      "is a date; use remember_decision when the family has settled on something " +
      "but nothing is scheduled. 'Book the dentist by Friday' is a task; " +
      "'we're switching Mateo to the later nap' is a decision.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The thing to be done, in a few words." },
        description: { type: "string", description: "Anything needed to actually do it." },
        due_at: {
          type: "string",
          description:
            "ISO-8601. When it is due. Required — a task without a date is a decision.",
        },
        owner: { type: "string", description: "Full name of the family member who owns it." },
        remind_at: {
          type: "string",
          description:
            "ISO-8601, optional. When to send a phone notification. Only when the user asked to be reminded at a time.",
        },
      },
      required: ["title", "due_at"],
    },
  },
  {
    name: "whats_due",
    description: "Everything currently due for the family: chores, tasks and dated decisions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_grocery",
    description: "Add an item to the family's grocery list.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string" },
        quantity: { type: "string", description: "Free text, e.g. '2 boxes'." },
        store: { type: "string", description: "Existing store name. Omit if unknown." },
      },
      required: ["item"],
    },
  },
  {
    name: "add_chore",
    description: "Add a recurring household chore.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string" },
        cadence_days: { type: "integer", minimum: 1, description: "Repeat interval in days." },
      },
      required: ["item", "cadence_days"],
    },
  },
  {
    name: "family_brief",
    description:
      "The family's current state in one read: each child's age, last-24h feeds/diapers/sleep, " +
      "last feed and diaper times, growth history, medicines with next dose due, the next " +
      "checkups and milestone checklists by age, everything due this week, and recently saved " +
      "evidence. Call this before answering any question about how a child is doing or what is " +
      "coming up. All numbers are computed by the database; report them, do not recompute them.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "log_feed",
    description:
      "Record a feed in the baby log (not in memory). Breast: give left_minutes and/or " +
      "right_minutes and which side came first; total is Left + Right. Bottle: give " +
      "bottle_amount and bottle_unit (ml, oz or g).",
    inputSchema: {
      type: "object",
      properties: {
        kid: KID,
        started_at: WHEN("When the feed started."),
        method: { type: "string", enum: ["breast", "bottle"] },
        left_minutes: { type: "number" },
        right_minutes: { type: "number" },
        first_side: { type: "string", enum: ["L", "R"] },
        bottle_amount: { type: "number" },
        bottle_unit: { type: "string", enum: ["ml", "oz", "g"] },
        contents: { type: "string", description: "Bottle contents, e.g. 'Breast Milk', 'Formula'." },
        note: { type: "string" },
      },
      required: ["kid", "started_at", "method"],
    },
  },
  {
    name: "log_diaper",
    description: "Record a diaper change in the baby log.",
    inputSchema: {
      type: "object",
      properties: {
        kid: KID,
        at: WHEN("When it was changed."),
        contents: { type: "string", enum: ["pee", "poo", "mixed", "dry"] },
        pee_size: { type: "string", enum: ["little", "medium", "big"] },
        poo_size: { type: "string", enum: ["little", "medium", "big"] },
        consistency: { type: "string", description: "Only if the user said, e.g. 'loose', 'solid'." },
        rash: { type: "boolean" },
        note: { type: "string" },
      },
      required: ["kid", "at", "contents"],
    },
  },
  {
    name: "log_sleep",
    description: "Record a sleep in the baby log. Omit ended_at only if the child is asleep right now.",
    inputSchema: {
      type: "object",
      properties: {
        kid: KID,
        started_at: WHEN("When the sleep started."),
        ended_at: { type: "string", description: "ISO-8601. When they woke. Omit if still asleep." },
        note: { type: "string" },
      },
      required: ["kid", "started_at"],
    },
  },
  {
    name: "log_growth",
    description:
      "Record a weight/length/head measurement in the baby log's Growth (US units). Use this — " +
      "not remember_fact — for any weight or measurement of a child.",
    inputSchema: {
      type: "object",
      properties: {
        kid: KID,
        measured_at: WHEN("When it was measured."),
        weight_lb: { type: "number" },
        weight_oz: { type: "number", description: "0 to 15.9" },
        length_in: { type: "number" },
        head_in: { type: "number" },
        note: { type: "string", description: "e.g. 'at the pediatrician'." },
      },
      required: ["kid", "measured_at"],
    },
  },
  {
    name: "add_medication",
    description:
      "Start tracking a medicine or supplement for a child. dose is exactly as on the label or as " +
      "the pediatrician said — never calculate or suggest a dose. every_hours only if a fixed interval was given.",
    inputSchema: {
      type: "object",
      properties: {
        kid: KID,
        name: { type: "string" },
        dose: { type: "string", description: "As written on the label or by the pediatrician." },
        every_hours: { type: "number" },
        notes: { type: "string" },
      },
      required: ["kid", "name"],
    },
  },
  {
    name: "log_medicine_dose",
    description: "Record that a tracked medicine was given. The medicine must exist (add_medication).",
    inputSchema: {
      type: "object",
      properties: {
        kid: KID,
        medicine: { type: "string", description: "Name as tracked." },
        given_at: WHEN("When it was given."),
        note: { type: "string" },
      },
      required: ["kid", "medicine", "given_at"],
    },
  },
  {
    name: "save_evidence",
    description:
      "Save a researched answer with its sources so it is not asked again. Citations are " +
      "required (title + https url, pmid when from PubMed). General information only — never a " +
      "diagnosis or a reading of this child's numbers; say what to ask the pediatrician instead.",
    inputSchema: {
      type: "object",
      properties: {
        kid: { type: "string", description: "Optional: the child it is about." },
        event_id: { type: "string", description: "Optional: the event (from list_events) this was researched for; it then shows on that event." },
        question: { type: "string" },
        answer: { type: "string", description: "A short plain-language summary of what the sources say." },
        citations: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, url: { type: "string" }, pmid: { type: "string" } },
            required: ["title", "url"],
          },
        },
      },
      required: ["question", "answer", "citations"],
    },
  },
  {
    name: "find_evidence",
    description: "Search answers saved earlier with save_evidence. Check here before researching again.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "add_event",
    description:
      "Book something with a date on the family's Plan: a checkup, a school meeting, an activity. " +
      "A doctor visit or school meeting starts with a sourced prep checklist (questions to ask, " +
      "things to bring) chosen by the child's age on the day. starts_at must include the time and " +
      "the family's UTC offset, e.g. 2026-10-07T14:40:00-04:00. Ask for the date and time rather than guessing.",
    inputSchema: {
      type: "object",
      properties: {
        kid: { type: "string", description: "Optional: the child it is for." },
        title: { type: "string", description: "e.g. '1-month checkup', 'Parent-teacher meeting'" },
        kind: { type: "string", enum: ["medical", "school", "activity", "family", "other"] },
        starts_at: { type: "string", description: "ISO-8601 with offset." },
        location: { type: "string" },
        with: { type: "string", description: "Doctor, clinic or teacher." },
        notes: { type: "string" },
      },
      required: ["title", "kind", "starts_at"],
    },
  },
  {
    name: "add_event_item",
    description:
      "Add to an event's prep or follow-up: a question to ask, something to bring or do, or (after) a " +
      "decision or follow-up. When it comes from research, include source_title and an https source_url. " +
      "Questions only — never a diagnosis or a reading of the child's numbers.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        kind: { type: "string", enum: ["question", "bring", "prep", "decision"] },
        text: { type: "string" },
        detail: { type: "string", description: "Why it's on the list, in a sentence." },
        source_title: { type: "string" },
        source_url: { type: "string" },
      },
      required: ["event_id", "kind", "text"],
    },
  },
  {
    name: "list_events",
    description:
      "The family's booked events with their checklists — questions (and answers written at the visit), " +
      "things to bring, decisions. Use it to prep for a visit or to follow up after one.",
    inputSchema: {
      type: "object",
      properties: {
        kid: { type: "string", description: "Optional: only this child's events." },
        include_past: { type: "boolean", description: "Also include the last 60 days." },
      },
    },
  },
  {
    name: "care_status",
    description:
      "A grown-up's recovery picture (e.g. Yenny after the birth): days since birth, the last blood pressure " +
      "readings with the published action for each (Preeclampsia Foundation: 160/110+ get care now, 140-159/90-109 " +
      "call the OB), medicines with next due times, the latest check-in and any warning signs it matched. Read this " +
      "before answering a health question about her, and repeat any action it returns plainly. Never interpret beyond it.",
    inputSchema: { type: "object", properties: { person: { type: "string", description: "First or full name, e.g. 'Yenny'." } }, required: ["person"] },
  },
  {
    name: "log_bp",
    description:
      "Record a blood pressure reading. taken_at is when it was measured (ask if unclear). Returns the published action " +
      "for the reading — tell the person immediately if it is anything other than 'Keep checking'.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        systolic: { type: "integer" },
        diastolic: { type: "integer" },
        pulse: { type: "integer" },
        taken_at: { type: "string", description: "ISO-8601 with offset." },
      },
      required: ["person", "systolic", "diastolic", "taken_at"],
    },
  },
  {
    name: "add_care_medication",
    description:
      "Track a grown-up's medicine. dose is exactly as on the label or prescription — never compute or suggest one. " +
      "interval_hours makes the app remind when the next dose is due.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        name: { type: "string" },
        dose: { type: "string" },
        interval_hours: { type: "number" },
        purpose: { type: "string" },
      },
      required: ["person", "name"],
    },
  },
  {
    name: "log_care_dose",
    description: "Record that a tracked medicine was taken. taken_at is when it was taken.",
    inputSchema: {
      type: "object",
      properties: { person: { type: "string" }, medicine: { type: "string" }, taken_at: { type: "string" } },
      required: ["person", "medicine", "taken_at"],
    },
  },
  {
    name: "log_checkin",
    description:
      "Record a recovery check-in. Scores are 0-10. Returns any POST-BIRTH warning signs matched (with the latest BP) — " +
      "relay them plainly and first.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        at: { type: "string" },
        headache: { type: "integer" },
        headache_lying: { type: "string", enum: ["better", "same", "unsure"] },
        headache_after_meds: { type: "string", enum: ["better", "not_better"] },
        vision_changes: { type: "boolean" },
        pain: { type: "integer" },
        temp_f: { type: "number" },
        bleeding: { type: "string", enum: ["light", "moderate", "soaking"] },
        incision: { type: "string", enum: ["fine", "red", "draining", "not_healing"] },
        leg: { type: "boolean" },
        mood: { type: "string", enum: ["good", "ok", "low"] },
        urgent: { type: "array", items: { type: "string", enum: ["chest_pain", "breathing", "seizure", "harm_thoughts"] } },
        note: { type: "string" },
      },
      required: ["person", "at"],
    },
  },
  {
    name: "add_care_note",
    description: "Save a note to a grown-up's care page — a question for the doctor, something to remember, a decision made.",
    inputSchema: {
      type: "object",
      properties: { person: { type: "string" }, text: { type: "string" }, at: { type: "string" } },
      required: ["person", "text"],
    },
  },
  {
    name: "log_food",
    description:
      "Record what a grown-up ate (e.g. Yenny), with nutrient totals for the amount eaten. When you estimate the numbers " +
      "from a description, set estimated: true — the app marks the entry 'est.'; set false only when the numbers come from " +
      "a label or the person gave them. Include whichever of these you can: " +
      NUTRIENTS.map((n) => `${n.key} (${n.unit})`).join(", ") +
      ". Returns today's totals against her targets — mention what is still short, briefly, without moralizing.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string", description: "First or full name, e.g. 'Yenny'." },
        name: { type: "string", description: "What was eaten, e.g. 'Greek yogurt with berries and granola'." },
        eaten_at: { type: "string", description: "ISO-8601 with offset. When it was eaten; ask if unclear." },
        meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        servings: { type: "number" },
        nutrients: {
          type: "object",
          description: "Totals for what was eaten (already multiplied by servings).",
          properties: Object.fromEntries(NUTRIENTS.map((n) => [n.key, { type: "number", description: `${n.label}, ${n.unit}` }])),
        },
        estimated: { type: "boolean", description: "true when the numbers are your estimate." },
        seafood_oz: { type: "number", description: "Ounces of fish or shellfish in it, if any." },
      },
      required: ["person", "name", "eaten_at", "nutrients", "estimated"],
    },
  },
  {
    name: "log_activity",
    description:
      "Record movement for a grown-up: a walk, stretching, pelvic floor exercises, PT, etc. Minutes are what she did. After " +
      "a cesarean, do not suggest an exercise target until care_status/nutrition_today shows she's been cleared by her OB.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        activity: { type: "string", enum: ["walk", "stretch", "pelvic_floor", "strength", "pt", "yoga", "swim", "bike", "other"] },
        minutes: { type: "number" },
        at: { type: "string", description: "ISO-8601 with offset — when it happened." },
        steps: { type: "integer" },
        note: { type: "string" },
      },
      required: ["person", "activity", "minutes", "at"],
    },
  },
  {
    name: "nutrition_today",
    description:
      "A grown-up's food for a day against her targets — protein, fiber, calories, vitamins and minerals — with how many " +
      "foods carried each number (a total from 1 of 5 foods is a floor, say so), seafood this week, movement minutes and " +
      "whether exercise is cleared, plus the sourced guidance. Targets are the published breastfeeding intakes (NIH/National " +
      "Academies) when she's breastfeeding; calories have no default because the sources disagree (DGA/CDC +330–400 vs " +
      "ACOG/MedlinePlus +450–500) — use only a goal she set. Read this before answering a food or movement question about her.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD in the family's time zone; defaults to today." },
      },
      required: ["person"],
    },
  },
  {
    name: "set_food_goal",
    description:
      "Save a personal food goal the person stated — a daily calorie goal, or a different target for a nutrient — usually " +
      "from her OB, rheumatologist or a dietitian. Never propose a calorie number yourself. Takes effect from start_date " +
      "(default today); earlier goals stay in the history.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string" },
        kcal: { type: "integer", description: "Daily calories. Omit to keep the current one; 0 clears it." },
        targets: {
          type: "object",
          description: "Per-nutrient targets that replace the defaults, same keys as log_food nutrients.",
        },
        start_date: { type: "string", description: "YYYY-MM-DD." },
        note: { type: "string", description: "Who set it, e.g. 'from the dietitian'." },
      },
      required: ["person"],
    },
  },
];

type Handler = (
  db: UserClient,
  userId: string,
  familyId: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export const HANDLERS: Record<string, Handler> = {
  async remember_fact(db, userId, familyId, args) {
    const row = await db.insert<{ id: string }>("memory_facts", {
      family_id: familyId,
      subject_type: oneOf(args, "subject_type", SUBJECT_TYPES),
      subject_label: str(args, "subject_label"),
      fact_key: str(args, "fact_key"),
      fact_value: str(args, "fact_value"),
      observed_at: requiredTimestamp(args, "observed_at"),
      certainty: oneOf(args, "certainty", CERTAINTIES),
      note: str(args, "note", false) || null,
      recorded_by_user_id: userId,
      written_by: WRITTEN_BY,
      source: "chat",
    });
    return { recorded: "fact", id: row.id };
  },

  async remember_decision(db, userId, familyId, args) {
    const ownerName = str(args, "owner", false);
    const row = await db.insert<{ id: string }>("memory_decisions", {
      family_id: familyId,
      decision: str(args, "decision"),
      context: str(args, "context", false) || null,
      decided_at: requiredTimestamp(args, "decided_at"),
      due_at: optionalTimestamp(args, "due_at"),
      owner_user_id: ownerName ? await resolveFamilyUser(db, ownerName) : null,
      // This table's actor column is decided_by_user_id; there is no
      // recorded_by_user_id on it. Same meaning, different name.
      decided_by_user_id: userId,
      written_by: WRITTEN_BY,
      source: "chat",
    });
    return { recorded: "decision", id: row.id };
  },

  async define_term(db, userId, familyId, args) {
    const row = await db.insert<{ id: string }>("memory_lexicon", {
      family_id: familyId,
      term: str(args, "term"),
      means: str(args, "means"),
      never_assume: str(args, "never_assume", false) || null,
      why_it_matters: str(args, "why_it_matters", false) || null,
      // last_confirmed_at is NOT NULL with no default. Unlike observed_at it is not
      // "when did this become true" but a confirmation clock, and defining the term
      // is the act of confirming it — so now() is the correct value, not a guess.
      last_confirmed_at: new Date().toISOString(),
      confirmed_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "term", id: row.id };
  },

  async record_correction(db, userId, familyId, args) {
    const row = await db.insert<{ id: string }>("memory_corrections", {
      family_id: familyId,
      what_was_said: str(args, "what_was_said"),
      what_is_true: str(args, "what_is_true"),
      correction_type: oneOf(args, "correction_type", CORRECTION_TYPES),
      occurred_at: requiredTimestamp(args, "occurred_at"),
      recorded_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "correction", id: row.id };
  },

  async recall(db, _userId, familyId, args) {
    return db.rpc("fn_memory_recall", {
      target_family_id: familyId,
      p_query: str(args, "query"),
    });
  },

  async remember_task(db, userId, familyId, args) {
    const ownerName = str(args, "owner", false);
    const row = await db.insert<{ id: string }>("tasks", {
      family_id: familyId,
      title: str(args, "title"),
      description: str(args, "description", false) || null,
      // Required, and for the same reason observed_at is on remember_fact: a
      // task is the shape that HAS a date. Defaulting it would quietly turn
      // every undated intention into something claiming to be due now, and
      // v_whats_due only shows tasks whose due_at is set — so a defaulted value
      // would be both wrong and invisible.
      due_at: requiredTimestamp(args, "due_at"),
      owner_user_id: ownerName ? await resolveFamilyUser(db, ownerName) : null,
      // Only sent when given, so the tool keeps working against a database
      // that predates the column.
      ...(optionalTimestamp(args, "remind_at") ? { remind_at: optionalTimestamp(args, "remind_at") } : {}),
      status: "open",
      created_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "task", id: row.id };
  },

  async whats_due(db, _userId, familyId) {
    return db.select("v_whats_due", `family_id=eq.${familyId}&order=due_on.asc`);
  },

  async add_grocery(db, _userId, familyId, args) {
    const storeName = str(args, "store", false);
    let storeId: string | null = null;

    if (storeName) {
      const stores = await db.select<{ id: string; name: string }>(
        "stores",
        `select=id,name&family_id=eq.${familyId}`
      );
      const hit = stores.find((s) => s.name.trim().toLowerCase() === storeName.toLowerCase());
      if (!hit) {
        // Better to refuse than to file the item under no store and say nothing.
        const known = stores.map((s) => s.name).join(", ") || "(none yet)";
        throw new ToolError(`no store named "${storeName}". Known stores: ${known}`);
      }
      storeId = hit.id;
    }

    const row = await db.insert<{ id: string }>("grocery_items", {
      family_id: familyId,
      name: str(args, "item"),
      quantity: str(args, "quantity", false) || null,
      store_id: storeId,
    });
    return { recorded: "grocery_item", id: row.id };
  },

  async add_chore(db, _userId, familyId, args) {
    const cadence = args.cadence_days;
    if (typeof cadence !== "number" || !Number.isInteger(cadence) || cadence < 1) {
      throw new ToolError("cadence_days must be a whole number of days, 1 or more");
    }
    const row = await db.insert<{ id: string; next_due_at: string }>("maintenance", {
      family_id: familyId,
      item: str(args, "item"),
      cadence_days: cadence,
    });
    return { recorded: "chore", id: row.id, next_due_at: row.next_due_at };
  },
  async family_brief(db, _userId, familyId) {
    return db.rpc("fn_family_brief", { p_family_id: familyId });
  },

  async log_feed(db, userId, familyId, args) {
    const kid = await resolveKid(db, familyId, str(args, "kid"));
    const startedAt = requiredTimestamp(args, "started_at");
    const method = oneOf(args, "method", ["breast", "bottle"]);
    let payload: Record<string, unknown>;
    let endedAt: string;
    if (method === "breast") {
      const first = str(args, "first_side", false) === "R" ? "R" : "L";
      const feed = build(() => breastFeed(startedAt, args.left_minutes, args.right_minutes, first));
      payload = feed.payload;
      endedAt = feed.endedAt;
    } else {
      payload = build(() => bottleFeed(args.bottle_amount, args.bottle_unit, args.contents));
      // A bottle is an amount, not a span: finished the moment it is logged, so
      // no screen mistakes it for a nursing session still in progress.
      endedAt = startedAt;
    }
    const row = await db.insert<{ id: string }>("baby_events", {
      family_id: familyId,
      kid_id: kid.id,
      event_type: "feed",
      started_at: startedAt,
      ended_at: endedAt,
      payload,
      note: str(args, "note", false) || null,
      logged_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "feed", id: row.id, kid: kid.name, payload, ended_at: endedAt };
  },

  async log_diaper(db, userId, familyId, args) {
    const kid = await resolveKid(db, familyId, str(args, "kid"));
    const payload = build(() => diaper(args as Parameters<typeof diaper>[0]));
    const row = await db.insert<{ id: string }>("baby_events", {
      family_id: familyId,
      kid_id: kid.id,
      event_type: "diaper",
      started_at: requiredTimestamp(args, "at"),
      payload,
      note: str(args, "note", false) || null,
      logged_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "diaper", id: row.id, kid: kid.name, payload };
  },

  async log_sleep(db, userId, familyId, args) {
    const kid = await resolveKid(db, familyId, str(args, "kid"));
    const startedAt = requiredTimestamp(args, "started_at");
    const endedAt = optionalTimestamp(args, "ended_at");
    if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new ToolError("ended_at is before started_at");
    }
    if (!endedAt) {
      // An open sleep is a running timer; a second one would stack on the first.
      const open = await db.select<{ id: string }>(
        "baby_events",
        `select=id&kid_id=eq.${kid.id}&event_type=eq.sleep&ended_at=is.null&limit=1`
      );
      if (open.length) throw new ToolError(`${kid.name} already has a sleep running; give ended_at for it first`);
    }
    const row = await db.insert<{ id: string }>("baby_events", {
      family_id: familyId,
      kid_id: kid.id,
      event_type: "sleep",
      started_at: startedAt,
      ended_at: endedAt,
      payload: {},
      note: str(args, "note", false) || null,
      logged_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "sleep", id: row.id, kid: kid.name, running: !endedAt };
  },

  async log_growth(db, userId, familyId, args) {
    const kid = await resolveKid(db, familyId, str(args, "kid"));
    const payload = build(() => growth(args));
    const row = await db.insert<{ id: string }>("baby_events", {
      family_id: familyId,
      kid_id: kid.id,
      event_type: "growth",
      started_at: requiredTimestamp(args, "measured_at"),
      payload,
      note: str(args, "note", false) || null,
      logged_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "growth", id: row.id, kid: kid.name, payload };
  },

  async add_medication(db, userId, familyId, args) {
    const kid = await resolveKid(db, familyId, str(args, "kid"));
    const every = args.every_hours;
    if (every !== undefined && every !== null && (typeof every !== "number" || !(every > 0))) {
      throw new ToolError("every_hours must be a positive number of hours");
    }
    const row = await db.insert<{ id: string }>("medications", {
      family_id: familyId,
      kid_id: kid.id,
      name: str(args, "name"),
      dose: str(args, "dose", false) || null,
      interval_hours: typeof every === "number" ? every : null,
      notes: str(args, "notes", false) || null,
      created_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "medication", id: row.id, kid: kid.name };
  },

  async log_medicine_dose(db, userId, familyId, args) {
    const kid = await resolveKid(db, familyId, str(args, "kid"));
    const wanted = str(args, "medicine").toLowerCase();
    const meds = await db.select<{ id: string; name: string; dose: string | null }>(
      "medications",
      `select=id,name,dose&kid_id=eq.${kid.id}&active=is.true`
    );
    const hits = meds.filter((m) => m.name.trim().toLowerCase() === wanted);
    if (hits.length !== 1) {
      const known = meds.map((m) => m.name).join(", ") || "(none tracked)";
      throw new ToolError(`no single active medicine "${args.medicine}" for ${kid.name}. Tracked: ${known}`);
    }
    const med = hits[0];
    const row = await db.insert<{ id: string }>("baby_events", {
      family_id: familyId,
      kid_id: kid.id,
      event_type: "medicine",
      started_at: requiredTimestamp(args, "given_at"),
      payload: { medication_id: med.id, name: med.name, ...(med.dose ? { dose: med.dose } : {}) },
      note: str(args, "note", false) || null,
      logged_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "medicine_dose", id: row.id, kid: kid.name, medicine: med.name };
  },

  async save_evidence(db, userId, familyId, args) {
    const kidName = str(args, "kid", false);
    const kid = kidName ? await resolveKid(db, familyId, kidName) : null;
    const cites = build(() => citations(args.citations));
    const ageDays =
      kid?.birth_date ? Math.floor((Date.now() - Date.parse(kid.birth_date)) / 86_400_000) : null;
    const eventId = str(args, "event_id", false) || null;
    const row = await db.insert<{ id: string }>("evidence_cards", {
      family_id: familyId,
      kid_id: kid?.id ?? null,
      event_id: eventId,
      question: str(args, "question"),
      answer: str(args, "answer"),
      citations: cites,
      child_age_days: ageDays,
      created_by_user_id: userId,
      written_by: WRITTEN_BY,
    });
    return { recorded: "evidence", id: row.id };
  },

  async find_evidence(db, _userId, familyId, args) {
    const q = str(args, "query").replace(/[%,()*]/g, " ").trim();
    const pattern = encodeURIComponent(`*${q}*`);
    return db.select(
      "evidence_cards",
      `select=question,answer,citations,child_age_days,created_at&family_id=eq.${familyId}` +
        `&or=(question.ilike.${pattern},answer.ilike.${pattern})&order=created_at.desc&limit=10`
    );
  },
  async add_event(db, _userId, familyId, args) {
    const kidName = str(args, "kid", false);
    const kid = kidName ? await resolveKid(db, familyId, kidName) : null;
    const kind = oneOf(args, "kind", ["medical", "school", "activity", "family", "other"]) as EventKind;
    const startsAt = requiredTimestamp(args, "starts_at");
    const event = await db.insert<{ id: string }>("family_events", {
      family_id: familyId,
      kid_id: kid?.id ?? null,
      kind,
      title: str(args, "title"),
      starts_at: startsAt,
      location: str(args, "location", false) || null,
      with_whom: str(args, "with", false) || null,
      notes: str(args, "notes", false) || null,
      written_by: WRITTEN_BY,
    });
    const { name, rows } = starterItems(kind, kid?.birth_date, startsAt, { eventId: event.id, familyId });
    for (const r of rows) await db.insert("event_items", { ...r, written_by: WRITTEN_BY });
    return {
      recorded: "event",
      id: event.id,
      checklist: name,
      items: rows.length,
      link: `https://family-coordinator.vercel.app/plan/${event.id}`,
    };
  },
  async add_event_item(db, _userId, familyId, args) {
    const eventId = str(args, "event_id");
    const events = await db.select<{ id: string }>("family_events", `select=id&id=eq.${encodeURIComponent(eventId)}&family_id=eq.${familyId}`);
    if (events.length !== 1) throw new ToolError(`no event ${eventId} in this family; call list_events for ids`);
    const url = str(args, "source_url", false);
    if (url && !url.startsWith("https://")) throw new ToolError("source_url must be an https URL");
    const row = await db.insert<{ id: string }>("event_items", {
      event_id: eventId,
      family_id: familyId,
      kind: oneOf(args, "kind", ["question", "bring", "prep", "decision"]),
      body: str(args, "text"),
      detail: str(args, "detail", false) || null,
      source_title: str(args, "source_title", false) || null,
      source_url: url || null,
      position: 1000,
      written_by: WRITTEN_BY,
    });
    return { recorded: "event_item", id: row.id };
  },
  async list_events(db, _userId, familyId, args) {
    const kidName = str(args, "kid", false);
    const kid = kidName ? await resolveKid(db, familyId, kidName) : null;
    const since = new Date(Date.now() - (args.include_past === true ? 60 * 86_400_000 : 6 * 3600_000)).toISOString();
    return db.select(
      "family_events",
      `select=id,title,kind,starts_at,location,with_whom,status,outcome,kids(name),` +
        `event_items(kind,body,detail,done,answer,source_url)` +
        `&family_id=eq.${familyId}&starts_at=gte.${encodeURIComponent(since)}` +
        (kid ? `&kid_id=eq.${kid.id}` : "") +
        `&order=starts_at.asc&limit=20`
    );
  },
  async care_status(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [profile, logs, meds] = await Promise.all([
      db.select<{ delivered_on: string | null; delivery_type: string | null }>("care_profiles", `select=delivered_on,delivery_type&person_user_id=eq.${person.id}`),
      db.select<{ kind: string; at: string; payload: Record<string, unknown> }>(
        "care_logs",
        `select=kind,at,payload&person_user_id=eq.${person.id}&family_id=eq.${familyId}&at=gte.${encodeURIComponent(since)}&order=at.desc&limit=200`
      ),
      db.select("v_care_medication_status", `select=name,dose,interval_hours,last_dose_at,next_due_at&person_user_id=eq.${person.id}&active=eq.true`),
    ]);
    const readings = logs
      .filter((l) => l.kind === "bp")
      .slice(0, 10)
      .map((l) => {
        const s = Number(l.payload.systolic);
        const d = Number(l.payload.diastolic);
        const band = bpBand(s, d);
        return { at: l.at, reading: `${s}/${d}`, pulse: l.payload.pulse ?? null, band: BP_ACTION[band].label, action: BP_ACTION[band].action };
      });
    const checkin = logs.find((l) => l.kind === "checkin");
    const latest = readings[0] ? parseBp(String(logs.find((l) => l.kind === "bp")!.payload.systolic), String(logs.find((l) => l.kind === "bp")!.payload.diastolic)) : null;
    return {
      person: person.name,
      delivered_on: profile[0]?.delivered_on ?? null,
      delivery_type: profile[0]?.delivery_type ?? null,
      bp_readings: readings,
      medicines: meds,
      last_checkin: checkin ? { at: checkin.at, answers: checkin.payload } : null,
      warnings: checkin ? checkInWarnings(checkin.payload as CheckIn, latest) : [],
      notes: logs.filter((l) => l.kind === "note").slice(0, 10).map((l) => ({ at: l.at, text: l.payload.text })),
      sources_note: "Thresholds: Preeclampsia Foundation (blood pressure), AWHONN POST-BIRTH warning signs. General guidance, not a diagnosis.",
    };
  },
  async log_bp(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const bp = parseBp(String(args.systolic ?? ""), String(args.diastolic ?? ""));
    if (!bp) throw new ToolError("systolic and diastolic must be plausible whole numbers (top then bottom)");
    const pulse = Number.isInteger(args.pulse) ? (args.pulse as number) : null;
    const row = await db.insert<{ id: string }>("care_logs", {
      family_id: familyId,
      person_user_id: person.id,
      kind: "bp",
      at: requiredTimestamp(args, "taken_at"),
      payload: { ...bp, pulse },
      written_by: WRITTEN_BY,
    });
    const band = bpBand(bp.systolic, bp.diastolic);
    return { recorded: "bp", id: row.id, reading: `${bp.systolic}/${bp.diastolic}`, band: BP_ACTION[band].label, action: BP_ACTION[band].action, source: "https://www.preeclampsia.org/blood-pressure" };
  },
  async add_care_medication(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const interval = args.interval_hours === undefined || args.interval_hours === null ? null : Number(args.interval_hours);
    if (interval !== null && (!Number.isFinite(interval) || interval <= 0 || interval > 168)) throw new ToolError("interval_hours must be between 0 and 168");
    const row = await db.insert<{ id: string }>("care_medications", {
      family_id: familyId,
      person_user_id: person.id,
      name: str(args, "name"),
      dose: str(args, "dose", false) || null,
      interval_hours: interval,
      purpose: str(args, "purpose", false) || null,
      written_by: WRITTEN_BY,
    });
    return { recorded: "care_medication", id: row.id };
  },
  async log_care_dose(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const wanted = str(args, "medicine").toLowerCase();
    const meds = await db.select<{ id: string; name: string; dose: string | null }>(
      "care_medications",
      `select=id,name,dose&person_user_id=eq.${person.id}&active=eq.true`
    );
    const hits = meds.filter((m) => m.name.toLowerCase() === wanted || m.name.toLowerCase().startsWith(wanted));
    if (hits.length !== 1)
      throw new ToolError(hits.length ? `"${wanted}" matches more than one medicine` : `no tracked medicine "${wanted}". Tracked: ${meds.map((m) => m.name).join(", ") || "none"} — add it with add_care_medication`);
    const m = hits[0];
    const row = await db.insert<{ id: string }>("care_logs", {
      family_id: familyId,
      person_user_id: person.id,
      kind: "dose",
      at: requiredTimestamp(args, "taken_at"),
      payload: { medication_id: m.id, name: m.name, ...(m.dose ? { dose: m.dose } : {}) },
      written_by: WRITTEN_BY,
    });
    return { recorded: "dose", id: row.id, medicine: m.name };
  },
  async log_checkin(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const KEYS = ["headache", "headache_lying", "headache_after_meds", "vision_changes", "pain", "temp_f", "bleeding", "incision", "leg", "mood", "urgent", "note"];
    const answers = Object.fromEntries(Object.entries(args).filter(([k, v]) => KEYS.includes(k) && v !== undefined && v !== null)) as CheckIn;
    const row = await db.insert<{ id: string }>("care_logs", {
      family_id: familyId,
      person_user_id: person.id,
      kind: "checkin",
      at: requiredTimestamp(args, "at"),
      payload: answers,
      written_by: WRITTEN_BY,
    });
    const last = await db.select<{ payload: Record<string, unknown> }>(
      "care_logs",
      `select=payload&person_user_id=eq.${person.id}&kind=eq.bp&order=at.desc&limit=1`
    );
    const bp = last[0] ? parseBp(String(last[0].payload.systolic), String(last[0].payload.diastolic)) : null;
    return { recorded: "checkin", id: row.id, warnings: checkInWarnings(answers, bp) };
  },
  async add_care_note(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const row = await db.insert<{ id: string }>("care_logs", {
      family_id: familyId,
      person_user_id: person.id,
      kind: "note",
      at: optionalTimestamp(args, "at") ?? new Date().toISOString(),
      payload: { text: str(args, "text") },
      written_by: WRITTEN_BY,
    });
    return { recorded: "note", id: row.id };
  },
  async log_food(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    if (typeof args.estimated !== "boolean") throw new ToolError("estimated is required: true when you estimated the numbers");
    const payload = nutrition(() =>
      foodPayload({
        name: args.name,
        meal: args.meal,
        servings: args.servings,
        nutrients: args.nutrients,
        estimated: args.estimated,
        source: args.estimated ? "claude_estimate" : "label",
        seafood_oz: args.seafood_oz,
      })
    );
    const eatenAt = requiredTimestamp(args, "eaten_at");
    const row = await db.insert<{ id: string }>("care_logs", {
      family_id: familyId,
      person_user_id: person.id,
      kind: "food",
      at: eatenAt,
      payload,
      written_by: WRITTEN_BY,
    });
    const tz = await familyTz(db, familyId);
    const summary = await nutritionDay(db, familyId, person, localDate(Date.parse(eatenAt), tz), tz);
    return { recorded: "food", id: row.id, estimated: payload.estimated === true, today: summary.main, still_short: summary.still_short };
  },
  async log_activity(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const payload = nutrition(() =>
      movePayload({ activity: args.activity, minutes: args.minutes, steps: args.steps, note: args.note, source: "claude_chat" })
    );
    const row = await db.insert<{ id: string }>("care_logs", {
      family_id: familyId,
      person_user_id: person.id,
      kind: "move",
      at: requiredTimestamp(args, "at"),
      payload,
      written_by: WRITTEN_BY,
    });
    return { recorded: "activity", id: row.id, minutes: payload.minutes };
  },
  async nutrition_today(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const tz = await familyTz(db, familyId);
    const date = str(args, "date", false) || localDate(Date.now(), tz);
    return nutritionDay(db, familyId, person, date, tz);
  },
  async set_food_goal(db, _userId, familyId, args) {
    const person = await resolvePerson(db, str(args, "person"));
    const tz = await familyTz(db, familyId);
    const startDate = str(args, "start_date", false) || localDate(Date.now(), tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ToolError("start_date must be YYYY-MM-DD");
    const current = await db.select<{ daily_kcal_target: number | null; micronutrient_targets: Nutrients | null }>(
      "person_nutrition_targets",
      `select=daily_kcal_target,micronutrient_targets&user_id=eq.${person.id}&start_date=lte.${startDate}&order=start_date.desc,created_at.desc&limit=1`
    );
    let kcal = current[0]?.daily_kcal_target ?? null;
    if (args.kcal !== undefined && args.kcal !== null) {
      const k = Number(args.kcal);
      if (k === 0) kcal = null;
      else if (!Number.isInteger(k) || k < 1000 || k > 5000) throw new ToolError("kcal must be a whole number between 1000 and 5000 (0 clears it)");
      else kcal = k;
    }
    const overrides = { ...(current[0]?.micronutrient_targets ?? {}), ...nutrition(() => cleanNutrients(args.targets)) };
    delete (overrides as Record<string, unknown>).kcal;
    const row = await db.insert<{ id: string }>("person_nutrition_targets", {
      family_id: familyId,
      user_id: person.id,
      start_date: startDate,
      daily_kcal_target: kcal,
      micronutrient_targets: Object.keys(overrides).length ? overrides : null,
      notes: str(args, "note", false) || null,
    });
    return { recorded: "food_goal", id: row.id, from: startDate, kcal, targets: overrides };
  },
};

/** NutritionError is the model's to fix, like any other bad argument. */
function nutrition<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof NutritionError) throw new ToolError(e.message);
    throw e;
  }
}

async function familyTz(db: UserClient, familyId: string): Promise<string> {
  const rows = await db.select<{ timezone: string | null }>("families", `select=timezone&id=eq.${familyId}`);
  return rows[0]?.timezone || "America/New_York";
}

/** One person's food and movement for a local day, against her targets. */
async function nutritionDay(db: UserClient, familyId: string, person: { id: string; name: string }, date: string, tz: string) {
  const [start, end] = nutrition(() => localDayBounds(date, tz));
  const weekStart = end - 7 * 86_400_000;
  const [profiles, goals, food, move] = await Promise.all([
    db.select<{ lactating: boolean; delivery_type: string | null; exercise_cleared_on: string | null; conditions: string[] }>(
      "care_profiles",
      `select=lactating,delivery_type,exercise_cleared_on,conditions&person_user_id=eq.${person.id}`
    ),
    db.select<{ daily_kcal_target: number | null; micronutrient_targets: Nutrients | null; start_date: string }>(
      "person_nutrition_targets",
      `select=daily_kcal_target,micronutrient_targets,start_date&user_id=eq.${person.id}&start_date=lte.${date}&order=start_date.desc,created_at.desc&limit=1`
    ),
    db.select<{ at: string; payload: FoodPayload }>(
      "care_logs",
      `select=at,payload&family_id=eq.${familyId}&person_user_id=eq.${person.id}&kind=eq.food` +
        `&at=gte.${encodeURIComponent(new Date(weekStart).toISOString())}&at=lt.${encodeURIComponent(new Date(end).toISOString())}&order=at.asc&limit=500`
    ),
    db.select<{ at: string; payload: MovePayload }>(
      "care_logs",
      `select=at,payload&family_id=eq.${familyId}&person_user_id=eq.${person.id}&kind=eq.move` +
        `&at=gte.${encodeURIComponent(new Date(weekStart).toISOString())}&at=lt.${encodeURIComponent(new Date(end).toISOString())}&order=at.asc&limit=500`
    ),
  ]);
  const profile = profiles[0] ?? null;
  const goal = goals[0];
  const targets = targetsFor(!!profile?.lactating, { kcal: goal?.daily_kcal_target, overrides: goal?.micronutrient_targets });
  const today = food.filter((r) => Date.parse(r.at) >= start);
  const rows = progress(dayTotals(today), targets).map((r) => ({
    nutrient: r.key,
    value: r.value,
    unit: r.unit,
    target: r.target?.value ?? null,
    target_from: r.target ? (r.target.from === "goal" ? "her own goal" : "breastfeeding intake (RDA/AI)") : null,
    percent: r.share === null ? null : Math.round(r.share * 100),
    from_foods: `${r.covered} of ${r.entries}`,
  }));
  const gate = exerciseGate(profile);
  const seafood = food.reduce((s, r) => s + (Number(r.payload.seafood_oz) || 0), 0);
  return {
    person: person.name,
    date,
    breastfeeding_targets: !!profile?.lactating,
    foods: today.map((r) => ({ at: r.at, name: r.payload.name, meal: r.payload.meal ?? null, estimated: r.payload.estimated === true })),
    main: rows.filter((r) => ["protein_g", "fiber_g", "kcal"].includes(r.nutrient)),
    vitamins_minerals: rows.filter((r) => !["protein_g", "fiber_g", "kcal"].includes(r.nutrient)),
    still_short: rows.filter((r) => r.percent !== null && r.percent < 100 && ["protein_g", "fiber_g", "kcal"].includes(r.nutrient)).map((r) => r.nutrient),
    seafood_oz_last_7_days: profile?.lactating ? { value: seafood, guidance_oz: `${SEAFOOD.minOz}-${SEAFOOD.maxOz}` } : undefined,
    movement: {
      minutes_today: minutesSince(move, start, end),
      minutes_last_7_days: minutesSince(move, weekStart, end),
      weekly_goal: gate.gated ? null : WEEKLY_MINUTES,
      exercise_cleared_on: profile?.exercise_cleared_on ?? null,
      guidance: gate.text,
    },
    guidance: {
      calories: CALORIE_GUIDANCE.map((g) => `${g.text} (${g.source.title})`),
      seafood: SEAFOOD.text,
      supplements: SUPPLEMENT_NOTE.text,
      rheumatoid_arthritis: profile?.conditions?.includes("rheumatoid_arthritis") ? RA_GUIDANCE.map((g) => `${g.text} (${g.strength})`) : undefined,
    },
    note: "Published intakes, not a plan for her. Totals only count what was logged; estimated entries are Claude's guesses.",
  };
}
