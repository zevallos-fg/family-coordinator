"use client";

import { useState } from "react";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BP_ACTION, SOURCES, bpBand, parseBp, type BpBand } from "@/lib/care/rules";
import { toLocalInputValue } from "@/lib/baby/time-input";
import type { CareLog } from "./useCare";

const SYS = "#3E9BE6";
const DIA = "#D67548";
const GRID = "#2E3A5E";
const MUTED = "#8794B6";
const SURFACE = "#1C2540";

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base tabular-nums text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-600";

export type Reading = { id: string; at: string; systolic: number; diastolic: number; pulse: number | null };

export function readingsOf(logs: CareLog[]): Reading[] {
  return logs
    .filter((l) => l.kind === "bp")
    .map((l) => {
      const p = l.payload as { systolic?: number | string; diastolic?: number | string; pulse?: number | string | null };
      return { id: l.id, at: l.at, systolic: Number(p.systolic), diastolic: Number(p.diastolic), pulse: p.pulse ? Number(p.pulse) : null };
    })
    .filter((r) => Number.isFinite(r.systolic) && Number.isFinite(r.diastolic));
}

function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()}`;
}

export function BandBadge({ band }: { band: BpBand }) {
  if (band === "under")
    return (
      <span className="flex items-center gap-1 text-[11px] text-stone-500">
        <Check className="h-3 w-3" aria-hidden /> {BP_ACTION.under.label}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
      <AlertTriangle className="h-3 w-3" aria-hidden /> {BP_ACTION[band].label}
    </span>
  );
}

/** Readings over time; hairlines at 140/90 and 160/110, where the actions change. */
function BpChart({ readings }: { readings: Reading[] }) {
  const pts = [...readings].slice(0, 14).reverse();
  if (pts.length < 2) return null;
  const W = 340;
  const H = 170;
  const L = 32;
  const T = 8;
  const B = 18;
  const lo = 40;
  const hi = Math.max(180, ...pts.map((p) => p.systolic + 10));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const x = (i: number) => L + 8 + ((W - L - 16) * i) / (pts.length - 1);
  const line = (k: "systolic" | "diastolic") => pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[k])}`).join(" ");
  const refs = [
    { v: 160, label: "160" },
    { v: 140, label: "140" },
    { v: 110, label: "110" },
    { v: 90, label: "90" },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Blood pressure readings over time" data-testid="bp-chart">
      {refs.map((r) => (
        <g key={r.v}>
          <line x1={L} x2={W - 4} y1={y(r.v)} y2={y(r.v)} stroke={GRID} strokeWidth={1} />
          <text x={L - 5} y={y(r.v) + 3} fontSize={9} fill={MUTED} textAnchor="end">
            {r.label}
          </text>
        </g>
      ))}
      {(["systolic", "diastolic"] as const).map((k) => (
        <g key={k}>
          <path d={line(k)} fill="none" stroke={k === "systolic" ? SYS : DIA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <circle key={p.id} cx={x(i)} cy={y(p[k])} r={4} fill={k === "systolic" ? SYS : DIA} stroke={SURFACE} strokeWidth={2} />
          ))}
        </g>
      ))}
      <text x={L + 8} y={H - 4} fontSize={9} fill={MUTED}>
        {new Date(pts[0].at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </text>
      <text x={W - 6} y={H - 4} fontSize={9} fill={MUTED} textAnchor="end">
        {new Date(pts[pts.length - 1].at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </text>
    </svg>
  );
}

/**
 * Blood pressure: type it in, see where it falls against the published action
 * thresholds, and keep the log the OB will ask for. The action shown is the
 * Preeclampsia Foundation's, word for word in substance; the app adds nothing.
 */
export function BpSection({
  familyId,
  personId,
  logs,
  onSaved,
}: {
  familyId: string;
  personId: string;
  logs: CareLog[];
  onSaved: () => void;
}) {
  const readings = readingsOf(logs);
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = readings[0] ?? null;
  const band = latest ? bpBand(latest.systolic, latest.diastolic) : null;

  async function save() {
    const bp = parseBp(sys.trim(), dia.trim());
    if (!bp) {
      toast.error("Check the numbers — top (systolic) then bottom (diastolic).");
      return;
    }
    setBusy(true);
    const p = pulse.trim() ? Number(pulse) : null;
    const { error } = await createClient()
      .from("care_logs")
      .insert({
        family_id: familyId,
        person_user_id: personId,
        kind: "bp",
        at: at ? new Date(at).toISOString() : new Date().toISOString(),
        payload: { ...bp, pulse: p && Number.isFinite(p) ? p : null },
      });
    setBusy(false);
    if (error) {
      toast.error("That didn't save. Try again?");
      return;
    }
    const b = bpBand(bp.systolic, bp.diastolic);
    if (b === "severe") toast.error(`${bp.systolic}/${bp.diastolic}: ${BP_ACTION.severe.action}`, { duration: 20000 });
    else if (b === "high") toast.warning(`${bp.systolic}/${bp.diastolic}: ${BP_ACTION.high.action}`, { duration: 12000 });
    else toast.success("Saved");
    setSys("");
    setDia("");
    setPulse("");
    setAt("");
    onSaved();
  }

  async function remove(id: string) {
    const { error } = await createClient().from("care_logs").delete().eq("id", id);
    if (error) toast.error("Couldn't remove that reading.");
    else onSaved();
  }

  return (
    <section className="space-y-2.5" data-testid="bp-section">
      <h2 className="text-xs uppercase tracking-wide text-stone-400">Blood pressure</h2>

      {latest && band && (
        <div
          className={`rounded-2xl bg-white p-3.5 ring-1 ${band === "under" ? "ring-stone-200" : "ring-2 ring-amber-600"}`}
          data-testid="bp-latest"
          data-band={band}
        >
          <p className="text-[11px] text-stone-500">Latest · {when(latest.at)}</p>
          <p className="text-2xl tabular-nums text-stone-800">
            {latest.systolic}/{latest.diastolic}
            {latest.pulse ? <span className="ml-2 text-sm text-stone-500">pulse {latest.pulse}</span> : null}
          </p>
          <BandBadge band={band} />
          {band !== "under" && <p className="mt-1 text-sm font-medium text-stone-800">{BP_ACTION[band].action}</p>}
          <a href={SOURCES.pfBp.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-amber-700 underline underline-offset-2">
            {SOURCES.pfBp.title}
          </a>
        </div>
      )}

      <form
        className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[11px] text-stone-500">
            Top
            <input inputMode="numeric" className={field} placeholder="120" value={sys} onChange={(e) => setSys(e.target.value)} data-testid="bp-sys" />
          </label>
          <label className="text-[11px] text-stone-500">
            Bottom
            <input inputMode="numeric" className={field} placeholder="80" value={dia} onChange={(e) => setDia(e.target.value)} data-testid="bp-dia" />
          </label>
          <label className="text-[11px] text-stone-500">
            Pulse
            <input inputMode="numeric" className={field} placeholder="opt." value={pulse} onChange={(e) => setPulse(e.target.value)} />
          </label>
        </div>
        <label className="block text-[11px] text-stone-500">
          Taken at (leave blank for now)
          <input
            type="datetime-local"
            className={field}
            value={at}
            max={toLocalInputValue(new Date())}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white disabled:opacity-50" data-testid="bp-save">
          {busy ? "Saving…" : "Save reading"}
        </button>
      </form>

      {readings.length >= 2 && (
        <div className="space-y-1 rounded-2xl border border-stone-200 bg-white p-2">
          <BpChart readings={readings} />
          <div className="flex gap-4 px-2 pb-1 text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SYS }} aria-hidden /> Top (systolic)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIA }} aria-hidden /> Bottom (diastolic)
            </span>
          </div>
        </div>
      )}

      {readings.length > 0 && (
        <details className="rounded-2xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-3 py-2.5 text-sm text-stone-700">All readings ({readings.length})</summary>
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {readings.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="block text-sm tabular-nums text-stone-800">
                    {r.systolic}/{r.diastolic}
                    {r.pulse ? <span className="text-stone-500"> · {r.pulse}</span> : null}
                  </span>
                  <span className="block text-[11px] text-stone-500">{when(r.at)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <BandBadge band={bpBand(r.systolic, r.diastolic)} />
                  <button type="button" onClick={() => void remove(r.id)} aria-label="Remove reading" className="text-stone-400">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="text-xs text-stone-600">
        <summary className="cursor-pointer text-stone-500">How to take a reading</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          <li>No caffeine, exercise or smoking for 30 minutes; empty your bladder.</li>
          <li>Sit quietly for 5 minutes without talking, back supported, feet flat, legs uncrossed.</li>
          <li>Arm resting at heart level, cuff on bare skin above the elbow.</li>
          <li>Take at least two readings, 1 minute apart, at the same times each day.</li>
        </ul>
        <a href={SOURCES.ahaHowTo.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-amber-700 underline underline-offset-2">
          {SOURCES.ahaHowTo.title}
        </a>
        <p className="mt-1">The Preeclampsia Foundation suggests recording your numbers twice a day after birth.</p>
      </details>
    </section>
  );
}
