"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { CareLog } from "./useCare";

/** Free notes — what she'd otherwise keep in the phone's notes app. */
export function NotesSection({
  familyId,
  personId,
  logs,
  onSaved,
}: {
  familyId: string;
  personId: string;
  logs: CareLog[];
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const notes = logs.filter((l) => l.kind === "note");

  async function add() {
    if (!text.trim()) return;
    const { error } = await createClient()
      .from("care_logs")
      .insert({ family_id: familyId, person_user_id: personId, kind: "note", payload: { text: text.trim() } });
    if (error) toast.error("That didn't save. Try again?");
    else {
      setText("");
      onSaved();
    }
  }

  async function remove(id: string) {
    const { error } = await createClient().from("care_logs").delete().eq("id", id);
    if (error) toast.error("Couldn't remove that note.");
    else onSaved();
  }

  return (
    <section className="space-y-2" data-testid="care-notes">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">Notes</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <textarea
          className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
          rows={2}
          placeholder="Anything to remember or ask about"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="rounded-lg bg-stone-100 px-3 text-sm text-stone-700">
          Add
        </button>
      </form>
      {notes.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <span>
                <span className="block whitespace-pre-line text-sm text-stone-800">{(n.payload as { text?: string }).text}</span>
                <span className="block text-[11px] text-stone-500">
                  {new Date(n.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
              <button type="button" onClick={() => void remove(n.id)} aria-label="Remove note" className="mt-0.5 text-stone-400">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
