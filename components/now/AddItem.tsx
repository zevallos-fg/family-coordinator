"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type When = "none" | "today" | "tomorrow" | "week";
const WHEN: Array<{ key: When; label: string }> = [
  { key: "none", label: "No date" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "Next week" },
];

/**
 * Noon local on the chosen day — never the current time. v_whats_due buckets by
 * due_at::date in UTC, and "now" at 11:44 pm Eastern is already tomorrow in
 * UTC, so a Today item added late at night would show up a day late. A fixed
 * midday time keeps the date the same in both zones.
 */
export function dueAt(when: When, now = new Date()): string | null {
  if (when === "none") return null;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (when === "tomorrow") d.setDate(d.getDate() + 1);
  if (when === "week") d.setDate(d.getDate() + 7);
  return d.toISOString();
}

/**
 * "Add something to do or discuss" — the one input on Now.
 *
 * Writes a task. A to-do and a "we need to talk about this" are the same thing
 * to the family: an item that stays on the screen until someone ticks it. With
 * no date it sits under "Anytime"; with one it lands in the right bucket.
 */
export function AddItem({
  familyId,
  people,
}: {
  familyId: string;
  people: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<When>("none");
  const [owner, setOwner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const open = title.trim().length > 0;

  async function save() {
    const text = title.trim();
    if (!text) return;
    setSaving(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").insert({
      family_id: familyId,
      title: text,
      due_at: dueAt(when),
      owner_user_id: owner,
      status: "open",
      created_by_user_id: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("That didn't save. Try again?");
      return;
    }
    toast.success("Added");
    setTitle("");
    setWhen("none");
    setOwner(null);
    startTransition(() => router.refresh());
  }

  const chip = (selected: boolean) =>
    `rounded-full px-3 py-2 text-sm ${
      selected ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
    }`;

  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-3" data-testid="add-item">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder="Add something to do or discuss"
          data-testid="add-item-title"
          className="min-w-0 flex-1 rounded-lg px-2 py-2 text-base text-stone-800 placeholder-stone-400 focus:outline-none"
        />
        {open && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="add-item-save"
            className="shrink-0 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {WHEN.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWhen(w.key)}
                aria-pressed={when === w.key}
                data-testid={`add-item-when-${w.key}`}
                className={chip(when === w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setOwner(null)} aria-pressed={owner === null} className={chip(owner === null)}>
              Either of us
            </button>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOwner(p.id)}
                aria-pressed={owner === p.id}
                data-testid={`add-item-owner-${p.id}`}
                className={chip(owner === p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
