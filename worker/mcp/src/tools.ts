import { UserClient } from "./supabase";

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
};
