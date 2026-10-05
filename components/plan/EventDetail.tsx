"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { formatWhen, relativeDay, startsAtFrom } from "@/lib/plan/events";
import { VisitNumbers } from "./VisitNumbers";

type Event = Database["public"]["Tables"]["family_events"]["Row"];
type Item = Database["public"]["Tables"]["event_items"]["Row"];
type Kid = { id: string; name: string; birth_date: string | null };
type Card = { id: string; question: string; answer: string; citations: unknown; created_at: string };

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";

function localDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

function ItemRow({
  item,
  onToggle,
  onAnswer,
  onDelete,
}: {
  item: Item;
  onToggle: () => void;
  onAnswer: (text: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState(item.answer ?? "");
  const hasMore = !!(item.detail || item.source_url) || item.kind === "question" || item.kind === "decision";
  return (
    <li className="px-3 py-2.5" data-testid={`item-${item.template_key ?? item.id}`}>
      <div className="flex items-start gap-2.5">
        {item.kind !== "decision" && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={item.done}
            aria-label={item.done ? "Mark not done" : "Mark done"}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              item.done ? "border-violet-600 bg-violet-600 text-white" : "border-stone-300"
            }`}
          >
            {item.done && <Check className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )}
        <button
          type="button"
          onClick={() => hasMore && setOpen(!open)}
          className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
        >
          <span className="min-w-0">
            <span className={`block text-sm ${item.done ? "text-stone-500 line-through" : "text-stone-800"}`}>{item.body}</span>
            {item.answer && !open && <span className="mt-0.5 block text-xs text-violet-600">{item.answer}</span>}
          </span>
          {hasMore && (
            <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
          )}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 pl-7">
          {item.detail && <p className="text-xs leading-relaxed text-stone-600">{item.detail}</p>}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noreferrer" className="flex items-start gap-1 text-[11px] text-amber-700 underline underline-offset-2">
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {item.source_title ?? item.source_url}
            </a>
          )}
          {item.kind === "question" && (
            <textarea
              className={field}
              rows={2}
              placeholder="What they said"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onBlur={() => answer !== (item.answer ?? "") && onAnswer(answer)}
            />
          )}
          <button type="button" onClick={onDelete} className="flex items-center gap-1 text-[11px] text-stone-500">
            <Trash2 className="h-3 w-3" aria-hidden /> Remove
          </button>
        </div>
      )}
    </li>
  );
}

function AddLine({ placeholder, onAdd, testId }: { placeholder: string; onAdd: (text: string) => Promise<boolean>; testId: string }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2 px-3 py-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim() && (await onAdd(text.trim()))) setText("");
      }}
    >
      <input className={field} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} data-testid={testId} />
      <button type="submit" aria-label="Add" className="rounded-lg bg-stone-100 px-3 text-stone-700">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}

/**
 * One event: when and where, the prep checklist (questions to ask, things to
 * bring), the child's own numbers for a doctor's visit, and afterwards what was
 * said and decided. Decisions can become to-dos in one tap, which is how a visit
 * turns into follow-through rather than a memory.
 */
export function EventDetail({
  familyId,
  event: initialEvent,
  items: initialItems,
  kid,
  cards,
  timeZone,
}: {
  timeZone: string;
  familyId: string;
  event: Event;
  items: Item[];
  kid: Kid | null;
  cards: Card[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [event, setEvent] = useState(initialEvent);
  const [items, setItems] = useState(initialItems);
  const [nowMs] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [outcome, setOutcome] = useState(event.outcome ?? "");
  const start = localDate(event.starts_at);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [where, setWhere] = useState(event.location ?? "");
  const [withWhom, setWithWhom] = useState(event.with_whom ?? "");

  async function patchItem(id: string, patch: Partial<Item>) {
    const before = items;
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("event_items").update(patch).eq("id", id);
    if (error) {
      setItems(before);
      toast.error("That didn't save. Try again?");
    }
  }

  async function removeItem(id: string) {
    const before = items;
    setItems(items.filter((i) => i.id !== id));
    const { error } = await supabase.from("event_items").delete().eq("id", id);
    if (error) {
      setItems(before);
      toast.error("Couldn't remove that.");
    }
  }

  async function addItem(kind: Item["kind"], body: string): Promise<boolean> {
    const position = items.reduce((n, i) => Math.max(n, i.position), 0) + 1;
    const { data, error } = await supabase
      .from("event_items")
      .insert({ event_id: event.id, family_id: familyId, kind, body, position })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("That didn't save. Try again?");
      return false;
    }
    setItems([...items, data]);
    return true;
  }

  async function patchEvent(patch: Partial<Event>) {
    const before = event;
    setEvent({ ...event, ...patch });
    const { error } = await supabase.from("family_events").update(patch).eq("id", event.id);
    if (error) {
      setEvent(before);
      toast.error("That didn't save. Try again?");
      return false;
    }
    router.refresh();
    return true;
  }

  async function toTodo(item: Item) {
    const { error } = await supabase.from("tasks").insert({
      family_id: familyId,
      title: item.body,
      description: `From ${kid ? `${kid.name}'s ` : ""}${event.title} (${formatWhen(event.starts_at, timeZone)})`,
      status: "open",
      written_by: "app",
    });
    if (error) toast.error("Couldn't add the to-do.");
    else toast.success("Added to To-dos");
  }

  async function remove() {
    const { error } = await supabase.from("family_events").delete().eq("id", event.id);
    if (error) {
      toast.error("Couldn't delete this event.");
      return;
    }
    router.push("/plan");
    router.refresh();
  }

  const questions = items.filter((i) => i.kind === "question");
  const bring = items.filter((i) => i.kind === "bring" || i.kind === "prep");
  const decisions = items.filter((i) => i.kind === "decision");
  const prep = [...questions, ...bring];
  const done = prep.filter((i) => i.done).length;
  const isPast = new Date(event.starts_at).getTime() < nowMs - 2 * 3600 * 1000 || event.status === "done";
  const showNumbers = event.kind === "medical" && kid?.birth_date && nowMs - Date.parse(kid.birth_date) < 365 * 86_400_000;

  const row = (i: Item) => (
    <ItemRow
      key={i.id}
      item={i}
      onToggle={() => void patchItem(i.id, { done: !i.done })}
      onAnswer={(a) => void patchItem(i.id, { answer: a || null })}
      onDelete={() => void removeItem(i.id)}
    />
  );

  return (
    <div className="mx-auto max-w-md space-y-4 pb-6" data-testid="event-detail">
      <Link href="/plan" className="flex items-center gap-1 text-sm text-stone-500">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Plan
      </Link>

      <header className="rounded-2xl border border-stone-200 bg-white p-4">
        {kid && <p className="text-xs text-sky-600">{kid.name}</p>}
        <h1 className="text-lg font-medium text-stone-800">{event.title}</h1>
        <p className="mt-0.5 text-sm text-stone-600">
          {formatWhen(event.starts_at, timeZone)} · {event.status === "planned" ? relativeDay(event.starts_at, new Date(nowMs), timeZone) : event.status}
        </p>
        {(event.with_whom || event.location) && (
          <p className="text-xs text-stone-500">{[event.with_whom, event.location].filter(Boolean).join(" · ")}</p>
        )}

        {editing ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const startsAt = startsAtFrom(date, time);
              if (!startsAt) return toast.error("Check the date.");
              if (await patchEvent({ starts_at: startsAt, location: where.trim() || null, with_whom: withWhom.trim() || null }))
                setEditing(false);
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
              <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
            </div>
            <input className={field} placeholder="With" value={withWhom} onChange={(e) => setWithWhom(e.target.value)} />
            <input className={field} placeholder="Where" value={where} onChange={(e) => setWhere(e.target.value)} />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 rounded-lg bg-violet-600 py-2 text-sm text-white">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="px-3 text-sm text-stone-500">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
              Edit time & place
            </button>
            {event.status === "planned" ? (
              <>
                <button type="button" onClick={() => void patchEvent({ status: "done" })} className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
                  Mark done
                </button>
                <button type="button" onClick={() => void patchEvent({ status: "cancelled" })} className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
                  Cancelled
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void patchEvent({ status: "planned" })} className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
                Back to planned
              </button>
            )}
            <button
              type="button"
              onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
              className={`rounded-full px-3 py-1.5 ${confirmDelete ? "bg-red-500 text-white" : "bg-stone-100 text-stone-500"}`}
            >
              {confirmDelete ? "Tap again to delete" : "Delete"}
            </button>
          </div>
        )}
      </header>

      {prep.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
            <span className="block h-full rounded-full bg-violet-600" style={{ width: `${Math.round((done / prep.length) * 100)}%` }} />
          </span>
          {done}/{prep.length} ready
        </div>
      )}

      <section className="space-y-1.5">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Questions to ask</h2>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {questions.map(row)}
          <li>
            <AddLine placeholder="Add your own question" onAdd={(t) => addItem("question", t)} testId="add-question" />
          </li>
        </ul>
        {questions.some((q) => q.source_url) && (
          <p className="text-[11px] text-stone-500">Tap a question for why it&apos;s here and its source. Write the answer in at the visit.</p>
        )}
      </section>

      <section className="space-y-1.5">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Before you go</h2>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {bring.map(row)}
          <li>
            <AddLine placeholder="Something to bring or do" onAdd={(t) => addItem("bring", t)} testId="add-bring" />
          </li>
        </ul>
      </section>

      {showNumbers && kid && <VisitNumbers kidId={kid.id} kidName={kid.name} />}

      {cards.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-xs uppercase tracking-wide text-stone-400">Researched for this</h2>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {cards.map((c) => (
              <li key={c.id} className="px-3 py-2.5">
                <details>
                  <summary className="cursor-pointer text-sm text-stone-800">{c.question}</summary>
                  <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{c.answer}</p>
                  <ul className="mt-1 space-y-0.5">
                    {(Array.isArray(c.citations) ? (c.citations as Array<{ title?: string; url?: string }>) : [])
                      .filter((s) => s.url)
                      .map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-amber-700 underline">
                            {s.title ?? s.url}
                          </a>
                        </li>
                      ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-1.5">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">{isPast ? "How it went" : "After the visit"}</h2>
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          <textarea
            className={field}
            rows={3}
            placeholder="What happened — measurements, what they said, anything to remember"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            onBlur={() => outcome !== (event.outcome ?? "") && void patchEvent({ outcome: outcome || null })}
            data-testid="event-outcome"
          />
          <p className="text-xs text-stone-500">Decisions and follow-ups</p>
          <ul className="divide-y divide-stone-100">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-stone-800">{d.body}</span>
                <span className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => void toTodo(d)} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-amber-700">
                    → To-do
                  </button>
                  <button type="button" onClick={() => void removeItem(d.id)} aria-label="Remove" className="text-stone-400">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="-mx-3 -mb-3">
            <AddLine placeholder="e.g. Recheck weight in 2 weeks" onAdd={(t) => addItem("decision", t)} testId="add-decision" />
          </div>
        </div>
      </section>
    </div>
  );
}
