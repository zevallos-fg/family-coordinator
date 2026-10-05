"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Card = Database["public"]["Tables"]["evidence_cards"]["Row"];
type Citation = { title: string; url: string; pmid?: string };

function citationsOf(card: Card): Citation[] {
  return Array.isArray(card.citations)
    ? (card.citations as unknown[]).filter(
        (c): c is Citation =>
          !!c && typeof (c as Citation).title === "string" && typeof (c as Citation).url === "string"
      )
    : [];
}

/**
 * Saved answers — questions asked once, with their sources.
 *
 * Written by Claude (save_evidence, citations required) when someone asks a
 * question in chat; shown here so the answer is still there next week and both
 * parents see the same one. General information with sources, never a reading
 * of this child's numbers.
 */
export function EvidenceCards({ familyId, kidId, kidName }: { familyId: string; kidId: string | null; kidName?: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      let query = supabase
        .from("evidence_cards")
        .select("*")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(20);
      // This child's cards plus the general ones that name no child.
      if (kidId) query = query.or(`kid_id.eq.${kidId},kid_id.is.null`);
      const { data, error } = await query;
      if (cancelled) return;
      setFailed(!!error);
      if (!error) setCards((data ?? []) as Card[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, kidId]);

  return (
    <section className="space-y-2" data-testid="evidence-cards">
      <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">Saved answers</h2>
      {failed && <p className="text-xs text-rose-700">Couldn&apos;t load saved answers.</p>}
      {!failed && cards.length === 0 && (
        <p className="text-xs text-stone-500">
          Ask Claude a question{kidName ? ` about ${kidName}` : ""} — answers with sources are saved here.
        </p>
      )}
      {cards.length > 0 && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {cards.map((c) => {
            const open = openId === c.id;
            const cites = citationsOf(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="w-full px-3 py-3 text-left active:bg-stone-50"
                >
                  <p className="text-sm font-medium text-stone-800">{c.question}</p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" · "}
                    {cites.length} source{cites.length === 1 ? "" : "s"}
                  </p>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-stone-100 bg-stone-50 px-3 py-3">
                    <p className="whitespace-pre-line text-sm text-stone-700">{c.answer}</p>
                    <ul className="space-y-1">
                      {cites.map((s) => (
                        <li key={s.url} className="text-xs">
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-amber-800 underline underline-offset-2">
                            {s.title}
                          </a>
                          {s.pmid ? <span className="text-stone-400"> · PMID {s.pmid}</span> : null}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-stone-400">General information, not medical advice. Ask your pediatrician about your child.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
