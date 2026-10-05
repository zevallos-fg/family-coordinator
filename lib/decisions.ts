import { createClient } from "@/lib/supabase/client";

/**
 * Closing and reopening a decision ("we said we'd install the car seat").
 *
 * The decisions table is append-only by design: nothing is ever edited or
 * deleted. A decision is closed by inserting a row that points back at it with
 * lifecycle_state = 'done' — which is exactly what v_memory_decisions_open
 * already excludes. Undo is the same move again: a fresh open copy that points
 * at the closing row, so the item comes back and the history of both taps is
 * kept.
 *
 * RLS allows family members to INSERT here and nothing else, which is all this
 * needs.
 */

interface DecisionRow {
  id: string;
  family_id: string;
  decision: string;
  context: string | null;
  owner_user_id: string | null;
  due_at: string | null;
}

async function load(id: string): Promise<DecisionRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("memory_decisions")
    .select("id, family_id, decision, context, owner_user_id, due_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as DecisionRow;
}

/** Returns the closing row's id, which is what an undo needs. */
export async function closeDecision(id: string): Promise<{ ok: true; closedBy: string } | { ok: false }> {
  const original = await load(id);
  if (!original) return { ok: false };
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("memory_decisions")
    .insert({
      family_id: original.family_id,
      decision: original.decision,
      context: original.context,
      owner_user_id: original.owner_user_id,
      decided_at: now,
      lifecycle_state: "done",
      lifecycle_at: now,
      supersedes_decision_id: original.id,
      source: "app",
      written_by: "app",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false };
  return { ok: true, closedBy: data.id as string };
}

/** Undo a close: an open copy of the original that supersedes the closing row. */
export async function reopenDecision(originalId: string, closedBy: string): Promise<boolean> {
  const original = await load(originalId);
  if (!original) return false;
  const supabase = createClient();
  const { error } = await supabase.from("memory_decisions").insert({
    family_id: original.family_id,
    decision: original.decision,
    context: original.context,
    owner_user_id: original.owner_user_id,
    due_at: original.due_at,
    decided_at: new Date().toISOString(),
    supersedes_decision_id: closedBy,
    source: "app",
    written_by: "app",
  });
  return !error;
}
