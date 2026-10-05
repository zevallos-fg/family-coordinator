"use client";

import { REPORT_COLORS, type Lane, type Mark } from "@/lib/baby/reports";

const W = 340;
const GUTTER = 38;
const HEAD = 22;
const HOUR = 24;
const H = HEAD + 24 * HOUR + 6;
const LANES: Array<{ lane: Lane; label: string; color: string }> = [
  { lane: "sleep", label: "Sleep", color: REPORT_COLORS.sleep },
  { lane: "feed", label: "Feed", color: REPORT_COLORS.feed },
  { lane: "diaper", label: "Diaper", color: REPORT_COLORS.dirty },
];
const LANE_W = (W - GUTTER) / LANES.length;
const BLOCK_W = 34;
const SURFACE = "#1C2540";
const GRID = "#2E3A5E";
const MUTED = "#8794B6";
const INK = "#EEF1FA";

function hourLabel(h: number) {
  if (h === 0 || h === 24) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/** A rect with 4px rounding only on the ends that are real starts/ends. */
function block(x: number, y: number, w: number, h: number, roundTop: boolean, roundBottom: boolean) {
  const r = Math.min(4, h / 2, w / 2);
  const rt = roundTop ? r : 0;
  const rb = roundBottom ? r : 0;
  return `M${x},${y + rt} a${rt},${rt} 0 0 1 ${rt},${-rt} h${w - 2 * rt} a${rt},${rt} 0 0 1 ${rt},${rt} v${h - rt - rb} a${rb},${rb} 0 0 1 ${-rb},${rb} h${-(w - 2 * rb)} a${rb},${rb} 0 0 1 ${-rb},${-rb} z`;
}

function diaperColor(m: Mark): string | null {
  const c = (m.event.payload as { contents?: string } | null)?.contents;
  if (c === "poo") return REPORT_COLORS.dirty;
  if (c === "both") return REPORT_COLORS.mixed;
  if (c === "pee") return REPORT_COLORS.wet;
  return null; // dry: drawn hollow
}

/**
 * One day, midnight to midnight, in three lanes. Spans are drawn to scale; a
 * span cut by midnight has a square end on that side. Diapers are dots — filled
 * dark for dirty (or mixed), light for wet, hollow for dry. Tap a mark to read it.
 */
export function DayTimeline({
  marks,
  nowMinute,
  selectedId,
  onSelect,
}: {
  marks: Mark[];
  /** Minutes since midnight when the day is today; null otherwise. */
  nowMinute: number | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const y = (min: number) => HEAD + (min / 60) * HOUR;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Timeline of the day: sleep, feeds and diapers" data-testid="day-timeline">
      <rect x={0} y={0} width={W} height={H} fill="transparent" onClick={() => onSelect(null)} />
      {LANES.map((l, i) => (
        <g key={l.lane}>
          <circle cx={GUTTER + i * LANE_W + 10} cy={10} r={4} fill={l.color} />
          <text x={GUTTER + i * LANE_W + 18} y={14} fontSize={11} fill={MUTED}>
            {l.label}
          </text>
        </g>
      ))}
      {Array.from({ length: 25 }, (_, h) => (
        <g key={h}>
          <line x1={GUTTER - 4} x2={W} y1={y(h * 60)} y2={y(h * 60)} stroke={GRID} strokeWidth={1} />
          {h % 2 === 0 && h < 24 && (
            <text x={GUTTER - 8} y={y(h * 60) + 4} fontSize={10} fill={MUTED} textAnchor="end">
              {hourLabel(h)}
            </text>
          )}
        </g>
      ))}
      {marks.map((m) => {
        const li = LANES.findIndex((l) => l.lane === m.lane);
        const cx = GUTTER + li * LANE_W + LANE_W / 2;
        const selected = m.id === selectedId;
        if (m.end === null) {
          const fill = diaperColor(m);
          return (
            <g key={m.id} onClick={() => onSelect(m.id)} className="cursor-pointer" data-testid={`mark-${m.lane}`}>
              <circle cx={cx} cy={y(m.start)} r={12} fill="transparent" />
              <circle
                cx={cx}
                cy={y(m.start)}
                r={6}
                fill={fill ?? SURFACE}
                stroke={selected ? INK : fill ? SURFACE : MUTED}
                strokeWidth={2}
              />
            </g>
          );
        }
        const top = y(m.start);
        const h = Math.max(3, y(m.end) - top);
        const color = m.lane === "sleep" ? REPORT_COLORS.sleep : REPORT_COLORS.feed;
        return (
          <g key={m.id} onClick={() => onSelect(m.id)} className="cursor-pointer" data-testid={`mark-${m.lane}`}>
            <rect x={cx - LANE_W / 2 + 4} y={top - 4} width={LANE_W - 8} height={h + 8} fill="transparent" />
            <path
              d={block(cx - BLOCK_W / 2, top, BLOCK_W, h, !m.clippedStart, !m.clippedEnd)}
              fill={color}
              stroke={selected ? INK : "none"}
              strokeWidth={selected ? 1.5 : 0}
            />
          </g>
        );
      })}
      {nowMinute !== null && (
        <g pointerEvents="none">
          <line x1={GUTTER - 4} x2={W} y1={y(nowMinute)} y2={y(nowMinute)} stroke={INK} strokeWidth={1} strokeOpacity={0.6} />
          <text x={W - 2} y={y(nowMinute) - 3} fontSize={9} fill={MUTED} textAnchor="end">
            now
          </text>
        </g>
      )}
    </svg>
  );
}
