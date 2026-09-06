"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { completionUndoToast } from "@/lib/undo";

type Props = {
  id: string;
  sourceTable: string;
  item: string;
  detail: string | null;
  recurring: boolean;
  daysUntil: number;
  owner: string | null;
};

function whenLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d over`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 13) return `${days}d`;
  return `${Math.round(days / 7)} wks`;
}

export function ChoreRow({
  id,
  sourceTable,
  item,
  detail,
  recurring,
  daysUntil,
  owner,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  // Decisions are closed by inserting a superseding row, not by an RPC — the
  // memory layer is append-only. Until that flow exists, they aren't tickable.
  const completable = sourceTable === "maintenance" || sourceTable === "tasks";

  async function complete() {
    if (!completable || done || pending) return;
    setDone(true);

    const supabase = createClient();
    const { error } =
      sourceTable === "maintenance"
        ? await supabase.rpc("fn_chore_done", { p_chore_id: id })
        : await supabase.rpc("fn_task_done", { p_task_id: id });

    if (error) {
      setDone(false);
      toast.error("Couldn't mark that done. Try again.");
      return;
    }

    const refresh = () => startTransition(() => router.refresh());

    await completionUndoToast({
      kind: sourceTable === "maintenance" ? "maintenance" : "tasks",
      id,
      message: recurring ? `${item} — next one scheduled` : `${item} done`,
      onShow: () => setDone(false),
      onHide: () => setDone(true),
      onSettled: refresh,
    });

    refresh();
  }

  const overdue = daysUntil < 0;

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <button
        type="button"
        onClick={complete}
        disabled={!completable}
        aria-label={completable ? `Mark ${item} done` : item}
        className={`h-6 w-6 shrink-0 rounded-full border transition-colors ${
          done
            ? "border-amber-700 bg-amber-700"
            : completable
              ? "border-stone-300 active:bg-stone-100"
              : "border-stone-200 opacity-40"
        }`}
      >
        {done && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 mx-auto text-white" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className={`text-sm ${done ? "text-stone-400 line-through" : "text-stone-800"}`}>
          {item}
        </div>
        {detail && (
          <div className="mt-0.5 truncate text-xs text-stone-500">{detail}</div>
        )}
      </div>

      {owner && (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] text-stone-600">
          {owner}
        </div>
      )}

      <div className={`shrink-0 text-xs ${overdue ? "text-red-600" : "text-stone-400"}`}>
        {whenLabel(daysUntil)}
      </div>
    </div>
  );
}
