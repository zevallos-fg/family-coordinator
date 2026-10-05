"use client";

export type Series = { name: string; color: string };
export type BarDatum = { key: string; tick: string; values: number[] };

const W = 340;
const H = 200;
const LEFT = 34;
const BOTTOM = 20;
const TOP = 8;
const GRID = "#2E3A5E";
const MUTED = "#8794B6";
const INK = "#EEF1FA";

/** 1, 2, 2.5, 5 × 10ⁿ steps, about four of them. */
export function niceTicks(max: number, step?: number): number[] {
  if (max <= 0) return [0, 1];
  let s = step;
  if (!s) {
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    s = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? 10 * mag;
  }
  const out: number[] = [];
  for (let v = 0; v <= max + s * 0.999; v += s) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function topRounded(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} a${r},${r} 0 0 1 ${r},${-r} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h} z`;
}

/**
 * Bars per day, week or month. "stack" piles the series (night under naps);
 * "group" sets them side by side (wet beside dirty). Bars are capped at 24px,
 * rounded only at the data end, with a 2px gap between stacked parts; the
 * selected bar is outlined and read out above the chart by the caller.
 */
export function TrendChart({
  data,
  series,
  mode,
  format,
  tickStep,
  band,
  selected,
  onSelect,
  label,
}: {
  /** The typical range for this age, drawn as a quiet band behind the bars. */
  band?: { min?: number; max?: number; label: string };
  data: BarDatum[];
  series: Series[];
  mode: "stack" | "group";
  format: (v: number) => string;
  tickStep?: number;
  selected: number | null;
  onSelect: (i: number) => void;
  label: string;
}) {
  const plotW = W - LEFT - 4;
  const plotH = H - TOP - BOTTOM;
  const totals = data.map((d) => (mode === "stack" ? d.values.reduce((a, b) => a + b, 0) : Math.max(0, ...d.values)));
  const ticks = niceTicks(Math.max(0, ...totals, band?.max ?? 0), tickStep);
  const top = ticks[ticks.length - 1] || 1;
  const yOf = (v: number) => TOP + plotH - (v / top) * plotH;
  const slot = plotW / Math.max(1, data.length);
  const every = Math.ceil(data.length / 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label} data-testid="trend-chart">
      {band && (band.min !== undefined || band.max !== undefined) && (
        <g pointerEvents="none" data-testid="range-band">
          <rect
            x={LEFT}
            width={W - 4 - LEFT}
            y={yOf(band.max ?? top)}
            height={yOf(band.min ?? 0) - yOf(band.max ?? top)}
            fill={INK}
            fillOpacity={0.06}
          />
          <text x={W - 6} y={yOf(band.max ?? top) - 3} fontSize={9} fill={MUTED} textAnchor="end">
            {band.label}
          </text>
        </g>
      )}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={LEFT} x2={W - 4} y1={yOf(t)} y2={yOf(t)} stroke={GRID} strokeWidth={1} />
          <text x={LEFT - 6} y={yOf(t) + 3.5} fontSize={9.5} fill={MUTED} textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = LEFT + slot * i + slot / 2;
        const isSel = selected === i;
        let bars: React.ReactNode;
        if (mode === "stack") {
          const w = Math.min(24, slot * 0.62);
          let acc = 0;
          const parts = d.values.map((v, si) => ({ v, si })).filter((p) => p.v > 0);
          bars = parts.map((p, pi) => {
            const y0 = yOf(acc);
            acc += p.v;
            const y1 = yOf(acc);
            const last = pi === parts.length - 1;
            // 2px surface gap above every part but the top one.
            const h = Math.max(0, y0 - y1 - (last ? 0 : 2));
            return last ? (
              <path key={p.si} d={topRounded(cx - w / 2, y1, w, h)} fill={series[p.si].color} />
            ) : (
              <rect key={p.si} x={cx - w / 2} y={y1 + 2} width={w} height={h} fill={series[p.si].color} />
            );
          });
          if (isSel && parts.length)
            bars = (
              <>
                {bars}
                <rect x={cx - w / 2 - 2} y={yOf(acc) - 2} width={w + 4} height={yOf(0) - yOf(acc) + 2} fill="none" stroke={INK} strokeWidth={1} rx={4} />
              </>
            );
        } else {
          const n = d.values.length;
          const w = Math.min(12, (slot * 0.7 - 2 * (n - 1)) / n);
          const start = cx - (n * w + 2 * (n - 1)) / 2;
          bars = d.values.map((v, si) => {
            const x = start + si * (w + 2);
            const h = yOf(0) - yOf(v);
            return v > 0 ? (
              <path key={si} d={topRounded(x, yOf(v), w, h)} fill={series[si].color} stroke={isSel ? INK : "none"} strokeWidth={isSel ? 1 : 0} />
            ) : null;
          });
        }
        return (
          <g key={d.key} onClick={() => onSelect(i)} className="cursor-pointer" data-testid={`bar-${i}`}>
            <rect x={LEFT + slot * i} y={TOP} width={slot} height={plotH + BOTTOM} fill="transparent" />
            {bars}
            {(data.length - 1 - i) % every === 0 && (
              <text
                x={cx > W - 20 ? W - 2 : cx}
                y={H - 5}
                fontSize={9.5}
                fill={isSel ? INK : MUTED}
                textAnchor={cx > W - 20 ? "end" : "middle"}
              >
                {d.tick}
              </text>
            )}
          </g>
        );
      })}
      <line x1={LEFT} x2={W - 4} y1={yOf(0)} y2={yOf(0)} stroke={MUTED} strokeWidth={1} strokeOpacity={0.5} />
    </svg>
  );
}

export function Legend({ series, note }: { series: Series[]; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.name}
        </span>
      ))}
      {note && <span>{note}</span>}
    </div>
  );
}
