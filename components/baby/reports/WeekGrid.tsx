"use client";

import { REPORT_COLORS, type Mark } from "@/lib/baby/reports";

const W = 340;
const GUTTER = 30;
const HEAD = 30;
const HOUR = 14;
const H = HEAD + 24 * HOUR + 4;
const GRID = "#2E3A5E";
const MUTED = "#8794B6";
const INK = "#EEF1FA";

/**
 * Seven days side by side, midnight at the top. In each column sleep is the wide
 * band on the left, feeds the narrow one, diapers dots on the right. Tap a day
 * to open it.
 */
export function WeekGrid({
  days,
  todayStart,
  onOpen,
}: {
  days: Array<{ start: number; marks: Mark[] }>;
  todayStart: number;
  onOpen: (dayStart: number) => void;
}) {
  const colW = (W - GUTTER) / days.length;
  const y = (min: number) => HEAD + (min / 60) * HOUR;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Week of sleep, feeds and diapers" data-testid="week-grid">
      {[0, 6, 12, 18, 24].map((h) => (
        <g key={h}>
          <line x1={GUTTER - 3} x2={W} y1={y(h * 60)} y2={y(h * 60)} stroke={GRID} strokeWidth={1} />
          {h < 24 && (
            <text x={GUTTER - 6} y={y(h * 60) + 4} fontSize={9} fill={MUTED} textAnchor="end">
              {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
            </text>
          )}
        </g>
      ))}
      {days.map((d, i) => {
        const x0 = GUTTER + i * colW;
        const date = new Date(d.start);
        const isToday = d.start === todayStart;
        return (
          <g key={d.start} onClick={() => onOpen(d.start)} className="cursor-pointer" data-testid={`week-day-${i}`}>
            <rect x={x0} y={0} width={colW} height={H} fill="transparent" />
            <text x={x0 + colW / 2} y={11} fontSize={9} fill={MUTED} textAnchor="middle">
              {date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}
            </text>
            <text x={x0 + colW / 2} y={24} fontSize={11} fill={isToday ? INK : MUTED} fontWeight={isToday ? 600 : 400} textAnchor="middle">
              {date.getDate()}
            </text>
            {d.marks.map((m) => {
              if (m.end === null) {
                const c = (m.event.payload as { contents?: string } | null)?.contents;
                const fill = c === "poo" ? REPORT_COLORS.dirty : c === "both" ? REPORT_COLORS.mixed : c === "pee" ? REPORT_COLORS.wet : "none";
                return (
                  <circle key={m.id} cx={x0 + colW - 7} cy={y(m.start)} r={2.5} fill={fill} stroke={fill === "none" ? MUTED : "none"} strokeWidth={1} />
                );
              }
              const top = y(m.start);
              const h = Math.max(2, y(m.end) - top);
              return m.lane === "sleep" ? (
                <rect key={m.id} x={x0 + 3} y={top} width={colW * 0.42} height={h} rx={2} fill={REPORT_COLORS.sleep} />
              ) : (
                <rect key={m.id} x={x0 + 3 + colW * 0.42 + 2} y={top} width={colW * 0.2} height={h} rx={1.5} fill={REPORT_COLORS.feed} />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
