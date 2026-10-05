"use client";

import { ArrowDown, ArrowUp, Check } from "lucide-react";
import type { Tile } from "@/lib/baby/rangeTiles";

const STATUS = {
  below: { Icon: ArrowDown, text: "Below typical" },
  above: { Icon: ArrowUp, text: "Above typical" },
  within: { Icon: Check, text: "Within typical" },
} as const;

/**
 * A count beside its typical range. Outside the range the tile is outlined in
 * rose gold and says which way, with an arrow — never colour alone, and never
 * red: a range is general guidance, not an alarm. Tapping explains the range
 * and its source.
 */
export function RangeTiles({
  title,
  tiles,
  partial,
  onInfo,
}: {
  title: string;
  tiles: Tile[];
  partial: boolean;
  onInfo: (tile: Tile) => void;
}) {
  const flagged = tiles.some((t) => t.status === "below" || t.status === "above");
  return (
    <section className="space-y-1.5" data-testid="range-tiles">
      <p className="flex items-baseline justify-between text-xs">
        <span className="uppercase tracking-wide text-stone-400">{title}</span>
        {partial && <span className="text-stone-500">so far today</span>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => {
          const out = t.status === "below" || t.status === "above";
          const s = t.status ? STATUS[t.status] : null;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => t.guide && onInfo(t)}
              data-testid={`range-${t.key}`}
              data-status={t.status ?? "none"}
              className={`rounded-xl bg-white px-3 py-2.5 text-left ring-1 ${out ? "ring-2 ring-amber-600" : "ring-stone-200"}`}
            >
              <span className="block text-[11px] text-stone-500">{t.label}</span>
              <span className="block text-xl tabular-nums text-stone-800">{t.value}</span>
              <span className="block text-[11px] text-stone-500">{t.range ? `typ. ${t.range}` : "no range for this age"}</span>
              {s && (
                <span className={`mt-1 flex items-center gap-1 text-[11px] ${out ? "font-medium text-amber-700" : "text-stone-500"}`}>
                  <s.Icon className="h-3 w-3" aria-hidden />
                  {s.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {flagged && (
        <p className="text-[11px] text-stone-500" data-testid="range-note">
          Typical ranges are general guidance for this age, not a diagnosis. Tap a tile for the source; if something worries you, call your pediatrician.
        </p>
      )}
    </section>
  );
}
