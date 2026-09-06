"use client";

import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/**
 * One-touch deletes: act now, offer undo.
 *
 * A confirm dialog taxes every user for the mistakes of a few, and on mobile it is a
 * blocking native modal. The trade we make instead is: remove the row immediately,
 * bank it, and give the user a way back.
 *
 * Eight seconds, not sonner's default three. Someone holding a baby in one arm needs
 * time to find the button.
 */
export const UNDO_DURATION_MS = 8000;

/**
 * The tables fn_soft_delete accepts. This list is not a guess — it mirrors the
 * whitelist inside the function, which raises `invalid_parameter_value` for anything
 * else. Keep them in step: a table added here but not there fails at runtime, which
 * would put an Undo button on something that cannot be undone.
 *
 * Cascading children are banked with the parent and replayed on restore, discovered
 * from pg_constraint at run time rather than listed anywhere — so a new child table
 * is covered the day it is added, and undo stays honest without anyone remembering.
 */
export type UndoableTable =
  | "grocery_items"
  | "recipes"
  | "pantry_items"
  | "caregivers"
  | "baby_events"
  | "tasks";

/** Postgres speaks in error codes; users do not. */
function readable(message: string): string {
  if (/not eligible for undo-able delete/.test(message)) {
    return "That kind of item can't be removed this way.";
  }
  if (/still referenced by other records/.test(message)) {
    // e.g. a recipe you've already logged as a meal — those FKs are NO ACTION, so the
    // delete is refused outright rather than half-done. Nothing was banked or removed.
    return "Something else still points at it, so it can't be removed yet.";
  }
  if (/not found|not visible to you/.test(message)) {
    return "It looks like it was already removed.";
  }
  if (/already restored, expired, or not yours/.test(message)) {
    return "That's no longer in the trash.";
  }
  if (/JWT|not authenticated/i.test(message)) {
    return "Your session expired — sign in again.";
  }
  return "Something went wrong.";
}

async function restoreAll(trashIds: string[]): Promise<string | null> {
  const supabase = createClient();
  for (const trashId of trashIds) {
    const { error } = await supabase.rpc("fn_restore", { p_trash_id: trashId });
    if (error) return error.message;
  }
  return null;
}

type DeleteArgs = {
  table: UndoableTable;
  /** One id, or every id in a group — a group undoes as a single action. */
  ids: string[];
  /** Past tense, e.g. "Milk removed" or "3 items removed". */
  message: string;
  /** Put the rows back in local state. Called optimistically the moment Undo is tapped. */
  onShow: () => void;
  /** Take the rows back out of local state. Used when a delete fails, or an undo fails. */
  onHide: () => void;
  /** Reconcile with the server — usually startTransition(() => router.refresh()). */
  onSettled?: () => void;
};

/**
 * The caller has ALREADY removed the rows from local state before calling this.
 * That ordering is the point: the tap is instant and nothing waits on the network.
 *
 * On failure we call onHide/onShow to put the UI back where the data actually is.
 * The one thing we never do is leave the screen showing a success that did not happen.
 */
export async function deleteWithUndo({
  table,
  ids,
  message,
  onShow,
  onHide,
  onSettled,
}: DeleteArgs): Promise<void> {
  if (ids.length === 0) return;

  const supabase = createClient();
  const trashIds: string[] = [];

  for (const id of ids) {
    const { data, error } = await supabase.rpc("fn_soft_delete", {
      p_table: table,
      p_row_id: id,
    });

    if (error || !data) {
      // Partial group delete: put back whatever already went, so the user is never
      // left with half a group gone and no way to tell which half.
      if (trashIds.length > 0) await restoreAll(trashIds);
      onShow();
      toast.error(`Couldn't remove that. ${readable(error?.message ?? "")}`);
      return;
    }
    trashIds.push(data);
  }

  onSettled?.();

  toast.success(message, {
    duration: UNDO_DURATION_MS,
    action: {
      label: "Undo",
      onClick: async () => {
        onShow(); // instant — the row is back before the request leaves
        const failure = await restoreAll(trashIds);
        if (failure) {
          onHide();
          toast.error(`Couldn't undo that. ${readable(failure)}`);
          return;
        }
        onSettled?.();
      },
    },
  });
}

type CompletionArgs = {
  /** Which undo RPC applies — maintenance chores and tasks are undone differently. */
  kind: "maintenance" | "tasks";
  id: string;
  message: string;
  onShow: () => void;
  onHide: () => void;
  onSettled?: () => void;
};

/**
 * Undo for completion rather than deletion. Ticking something off is the most common
 * one-tap action in the app and the easiest to do by accident on a phone.
 */
export async function completionUndoToast({
  kind,
  id,
  message,
  onShow,
  onHide,
  onSettled,
}: CompletionArgs): Promise<void> {
  toast.success(message, {
    duration: UNDO_DURATION_MS,
    action: {
      label: "Undo",
      onClick: async () => {
        onShow(); // un-tick immediately
        const supabase = createClient();
        const { error } =
          kind === "maintenance"
            ? await supabase.rpc("fn_chore_undo", { p_chore_id: id })
            : await supabase.rpc("fn_task_undo", { p_task_id: id });

        if (error) {
          onHide(); // it is still done; say so rather than lie
          toast.error(`Couldn't undo that. ${readable(error.message)}`);
          return;
        }
        onSettled?.();
      },
    },
  });
}
