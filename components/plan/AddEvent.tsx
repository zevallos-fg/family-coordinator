"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { EVENT_KINDS, starterItems, startsAtFrom } from "@/lib/plan/events";
import type { EventKind } from "@/lib/plan/templates";

type Kid = { id: string; name: string; birth_date: string | null };

const input =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";

function Chip({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-sm ${on ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-700"}`}
    >
      {children}
    </button>
  );
}

/**
 * Add an event. A checkup or a school meeting starts with its prep checklist
 * already filled in, chosen by the child's age on the day (lib/plan/templates).
 */
export function AddEvent({ familyId, kids }: { familyId: string; kids: Kid[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [kidId, setKidId] = useState<string | null>(kids[0]?.id ?? null);
  const [kind, setKind] = useState<EventKind>("medical");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [withWhom, setWithWhom] = useState("");

  async function save() {
    const startsAt = startsAtFrom(date, time);
    if (!title.trim() || !startsAt) {
      toast.error("Add what it is and the date.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("family_events")
      .insert({
        family_id: familyId,
        kid_id: kidId,
        kind,
        title: title.trim(),
        starts_at: startsAt,
        location: location.trim() || null,
        with_whom: withWhom.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error("That didn't save. Try again?");
      return;
    }
    const kid = kids.find((k) => k.id === kidId);
    const { rows } = starterItems(kind, kid?.birth_date, startsAt, { eventId: data.id, familyId });
    if (rows.length) {
      const { error: itemsError } = await supabase.from("event_items").insert(rows);
      // The event saved; only its starter checklist didn't. Say so and carry on.
      if (itemsError) toast.error("Saved, but the prep checklist didn't load. Add questions by hand.");
    }
    router.push(`/plan/${data.id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="add-event"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-600 py-3 text-sm text-violet-600 active:bg-stone-100"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add an event
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-stone-200 bg-white p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="add-event-form"
    >
      <input
        className={input}
        placeholder="What is it? e.g. 1-month checkup"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        data-testid="event-title"
      />

      <div className="flex flex-wrap gap-1.5">
        {kids.map((k) => (
          <Chip key={k.id} on={kidId === k.id} onClick={() => setKidId(k.id)} testId={`event-kid-${k.id}`}>
            {k.name}
          </Chip>
        ))}
        <Chip on={kidId === null} onClick={() => setKidId(null)}>
          Family
        </Chip>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {EVENT_KINDS.map((k) => (
          <Chip key={k.value} on={kind === k.value} onClick={() => setKind(k.value)} testId={`event-kind-${k.value}`}>
            {k.label}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" data-testid="event-date" />
        <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" data-testid="event-time" />
      </div>
      <input
        className={input}
        placeholder={kind === "school" ? "With (teacher)" : "With (doctor, clinic)"}
        value={withWhom}
        onChange={(e) => setWithWhom(e.target.value)}
      />
      <input className={input} placeholder="Where" value={location} onChange={(e) => setLocation(e.target.value)} />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          data-testid="event-save"
          className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2.5 text-sm text-stone-500">
          Cancel
        </button>
      </div>
    </form>
  );
}
