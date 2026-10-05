"use client";

import { Sheet } from "@/components/ui/Sheet";
import { AAP_SAFE_SLEEP, SAFE_SLEEP_POINTS, type Guide } from "@/lib/baby/glance";

export function GuideBody({ guide, kidName }: { guide: Guide; kidName: string }) {
  return (
    <div className="space-y-3">
      <p className="text-3xl font-light tabular-nums text-sky-600">{guide.range}</p>
      <p className="text-sm leading-relaxed text-stone-700">{guide.body}</p>
      {guide.ruleOfThumb && (
        <p className="text-xs text-stone-500">A rule of thumb, not research — use it as a nudge, not a target.</p>
      )}
      <a href={guide.source.url} target="_blank" rel="noreferrer" className="block text-xs text-amber-700 underline underline-offset-2">
        {guide.source.title}
      </a>
      <p className="text-[11px] text-stone-400">
        General information, not medical advice. Questions about {kidName} go to your pediatrician.
      </p>
    </div>
  );
}

export function SafeSleep() {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-stone-800">Safe sleep</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        {SAFE_SLEEP_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <a href={AAP_SAFE_SLEEP.url} target="_blank" rel="noreferrer" className="block text-xs text-amber-700 underline underline-offset-2">
        {AAP_SAFE_SLEEP.title}
      </a>
    </div>
  );
}

/** A sheet explaining one or more ranges, with the safe-sleep points for sleep. */
export function GuideSheet({
  open,
  onClose,
  title,
  guides,
  kidName,
  safeSleep,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  guides: Guide[];
  kidName: string;
  safeSleep?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-6">
        {guides.map((g) => (
          <div key={g.title} className="space-y-1">
            {guides.length > 1 && <h3 className="text-sm font-medium text-stone-800">{g.title}</h3>}
            <GuideBody guide={g} kidName={kidName} />
          </div>
        ))}
        {safeSleep && <SafeSleep />}
      </div>
    </Sheet>
  );
}
