import { compareToRange, type Guide, type RangeStatus } from "./glance";
import { hm, type DayStats } from "./reports";

export type Tile = {
  key: string;
  label: string;
  value: string;
  range: string | null;
  status: RangeStatus | null;
  guide: Guide | null;
};

const H = 3_600_000;

type Guides = Partial<Record<"feeds" | "wet" | "stools" | "sleep", Guide>>;

/**
 * The four counts the guidance talks about — sleep, feeds, wet and dirty
 * diapers — for one day, or the average day across several.
 *
 * `partial` is today, still going: nothing is called "below" until the day is
 * over. For an average, each measure only averages the days that fall under the
 * same range as `current` (the range at the end of the period): a newborn's
 * day-2 diapers are not averaged against the day-5 range.
 */
export function rangeTiles(
  days: DayStats[],
  current: Guides,
  guideAt: (dayStart: number) => Guides,
  opts: { partial: boolean; average: boolean }
): Tile[] {
  const pick = (key: keyof Guides, f: (d: DayStats) => number, scale = 1) => {
    const g = current[key];
    const use = opts.average && g ? days.filter((d) => guideAt(d.dayStart)[key]?.range === g.range) : days;
    if (!use.length) return { v: 0, status: null as RangeStatus | null };
    const total = use.reduce((a, d) => a + f(d), 0) / scale;
    const v = opts.average ? total / use.length : total;
    return { v, status: compareToRange(v, g?.bounds, opts.partial) };
  };
  const fmt = (v: number) => (opts.average ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v)));
  const sleep = pick("sleep", (d) => d.nightMs + d.napMs, H);
  const feeds = pick("feeds", (d) => d.feeds);
  const wet = pick("wet", (d) => d.wet);
  const dirty = pick("stools", (d) => d.dirty);
  return [
    { key: "sleep", label: "Sleep", value: hm(sleep.v * H), range: current.sleep?.range ?? null, status: sleep.status, guide: current.sleep ?? null },
    { key: "feeds", label: "Feeds", value: fmt(feeds.v), range: current.feeds?.range ?? null, status: feeds.status, guide: current.feeds ?? null },
    { key: "wet", label: "Wet diapers", value: fmt(wet.v), range: current.wet?.range ?? null, status: wet.status, guide: current.wet ?? null },
    { key: "dirty", label: "Dirty diapers", value: fmt(dirty.v), range: current.stools?.range ?? null, status: dirty.status, guide: current.stools ?? null },
  ];
}

