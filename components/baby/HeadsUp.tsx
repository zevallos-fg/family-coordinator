"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, ChevronRight, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ageLine, headsUp, type Checkpoint, type Med, type Note, type Planned } from "@/lib/baby/headsup";
import type { BabyEvent } from "@/lib/baby/events";

type Kid = { id: string; name: string; birth_date: string | null };

const TONE: Record<Note["tone"], { Icon: typeof Info; color: string }> = {
  raise: { Icon: AlertCircle, color: "text-amber-600" },
  plan: { Icon: CalendarDays, color: "text-violet-600" },
  info: { Icon: Info, color: "text-sky-600" },
};

/** What the heads-up needs beyond the lane: checkpoints, booked events, medicines. */
function useContext(familyId: string, kidId: string | null, refreshKey: string) {
  const [ctx, setCtx] = useState<{ checkpoints: Checkpoint[]; planned: Planned[]; meds: Med[] } | null>(null);
  useEffect(() => {
    if (!kidId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [cp, ev, md] = await Promise.all([
        supabase.from("age_checkpoints").select("id, kind, label, age, source_url"),
        supabase
          .from("family_events")
          .select("id, title, kind, starts_at, event_items(kind, done)")
          .eq("family_id", familyId)
          .eq("kid_id", kidId)
          .eq("status", "planned")
          .gte("starts_at", new Date(Date.now() - 2 * 3600_000).toISOString())
          .order("starts_at"),
        supabase.from("v_medication_status").select("name, next_due_at").eq("kid_id", kidId).eq("active", true),
      ]);
      if (cancelled) return;
      const planned: Planned[] = (ev.data ?? []).map((e) => {
        const items = ((e as { event_items?: Array<{ kind: string; done: boolean }> }).event_items ?? []).filter(
          (i) => i.kind !== "decision"
        );
        return {
          id: e.id,
          title: e.title,
          kind: e.kind,
          starts_at: e.starts_at,
          prep_done: items.filter((i) => i.done).length,
          prep_total: items.length,
        };
      });
      setCtx({
        checkpoints: (cp.data ?? []) as Checkpoint[],
        planned,
        meds: ((md.data ?? []) as Array<{ name: string | null; next_due_at: string | null }>).map((m) => ({
          name: m.name ?? "Medicine",
          next_due_at: m.next_due_at,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, kidId, refreshKey]);
  return kidId ? ctx : null;
}

function NoteRow({ note }: { note: Note }) {
  const { Icon, color } = TONE[note.tone];
  const text = (
    <>
      <span className="block text-sm text-stone-800">{note.title}</span>
      {note.detail && <span className="block text-xs text-stone-500">{note.detail}</span>}
    </>
  );
  // The row is a link when it leads somewhere; a source stays its own link
  // beneath, never nested inside another.
  return (
    <li data-testid={`headsup-${note.key}`} data-tone={note.tone} className="flex items-start gap-2.5 px-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-hidden />
      <span className="min-w-0 flex-1">
        {note.href ? (
          <Link href={note.href} className="flex items-start justify-between gap-2">
            <span className="min-w-0">{text}</span>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          </Link>
        ) : (
          text
        )}
        {note.source && (
          <a href={note.source.url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11px] text-amber-700 underline underline-offset-2">
            {note.source.title}
          </a>
        )}
      </span>
    </li>
  );
}

/**
 * The top of the Kids page: what needs raising, what's booked, and what's worth
 * knowing at this age. See lib/baby/headsup.ts for the rules.
 */
export function HeadsUp({
  familyId,
  kid,
  events,
  nowMs,
}: {
  familyId: string;
  kid: Kid | null;
  events: BabyEvent[];
  nowMs: number;
}) {
  const refreshKey = events.find((e) => e.event_type === "medicine")?.started_at ?? "";
  const ctx = useContext(familyId, kid?.id ?? null, refreshKey);
  if (!kid) return null;
  // Re-evaluated each second with the page clock, so an open feed is raised the
  // minute it crosses the line rather than on the next load.
  const notes = headsUp({
    kid,
    events,
    checkpoints: ctx?.checkpoints ?? [],
    planned: ctx?.planned ?? [],
    meds: ctx?.meds ?? [],
    nowMs,
  });
  const age = ageLine(kid.birth_date, nowMs);

  return (
    <section className="space-y-1.5" data-testid="heads-up">
      <p className="flex items-baseline justify-between text-xs">
        <span className="uppercase tracking-wide text-stone-400">Heads up</span>
        {age && <span className="text-sky-600">{age}</span>}
      </p>
      {notes.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-500">Nothing to raise right now.</p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {notes.map((n) => (
            <NoteRow key={n.key} note={n} />
          ))}
        </ul>
      )}
    </section>
  );
}
