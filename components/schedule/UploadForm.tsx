"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { processScreenshot, saveReconciliation, checkDatesHaveDuties } from "@/app/(app)/schedule/actions";
import type { Output } from "@/skills/family-schedule-reconciler";
import { formatWeekRange } from "@/lib/week";

function formatDayDate(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface UploadFormProps {
  weekOf: string; // YYYY-MM-DD (Monday of the target week)
}

export function UploadForm({ weekOf }: UploadFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Output | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [, startTransition] = useTransition();

  const weekLabel = formatWeekRange(new Date(weekOf + "T12:00:00"));

  function handleFile(file: File) {
    const url = URL.createObjectURL(file);
    setPreview(url);
    setResult(null);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleAnalyze() {
    if (!fileRef.current?.files?.[0]) {
      setError("Please select a calendar screenshot first.");
      return;
    }
    setAnalyzing(true);
    setError(null);

    const fd = new FormData();
    fd.append("image", fileRef.current.files[0]);
    fd.append("weekOf", weekOf);

    const res = await processScreenshot(fd);
    setAnalyzing(false);

    if (!res.ok) {
      setError(res.error ?? "Analysis failed.");
      return;
    }
    setResult(res.data ?? null);
  }

  async function doSave() {
    if (!result) return;
    setSaving(true);
    const res = await saveReconciliation(result);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Save failed.");
      return;
    }
    startTransition(() => router.push(`/schedule?week=${weekOf}`));
  }

  async function handleSave() {
    if (!result) return;
    // UX safety net: check if this week already has duties
    const dates = result.days.map((d) => d.date);
    const hasDuties = await checkDatesHaveDuties(dates);
    if (hasDuties) {
      setShowReplaceConfirm(true);
    } else {
      await doSave();
    }
  }

  return (
    <div className="space-y-5">
      {/* Target week label */}
      <div className="text-xs text-stone-500 bg-stone-50 rounded-lg p-2.5">
        Assigning duties for: <span className="font-medium text-stone-700">{weekLabel}</span>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-stone-300 rounded-xl p-8 text-center cursor-pointer hover:border-amber-400 transition-colors"
      >
        {preview ? (
          <img src={preview} alt="Calendar preview" className="max-h-64 mx-auto rounded-lg object-contain" />
        ) : (
          <div>
            <p className="text-stone-400 text-sm mb-1">Drop your calendar screenshot here</p>
            <p className="text-xs text-stone-300">or click to browse · JPEG, PNG, WebP</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <div className="text-xs text-stone-400 bg-stone-50 rounded-lg p-3">
        Drop-off 9:00–9:30 AM · Pick-up 12:30–1:00 PM · Nap 1:30–2:00 PM · Red events ignored
      </div>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {!result && (
        <button
          onClick={handleAnalyze}
          disabled={!preview || analyzing}
          className="w-full py-3 rounded-xl font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing ? "Analyzing calendar…" : "Analyze & Assign Duties"}
        </button>
      )}

      {/* Results preview */}
      {result && (
        <div className="space-y-3">
          <h3 className="font-medium text-stone-700">Review duties</h3>
          {result.days.map((day) => (
            <div key={day.date} className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-sm font-medium text-stone-700 mb-2">{formatDayDate(day.date)}</p>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                {(["dropoff", "pickup", "nap"] as const).map((duty) => {
                  const d = day.duties[duty];
                  if (!d) return null;
                  return (
                    <div key={duty} className={`rounded-lg p-2 border ${d.assignee === "DISCUSS" ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-stone-50"}`}>
                      <p className="text-xs text-stone-400 capitalize">{duty}</p>
                      <p className={`font-medium ${d.assignee === "DISCUSS" ? "text-rose-600" : "text-stone-800"}`}>{d.assignee}</p>
                    </div>
                  );
                })}
              </div>
              {day.events.filter((e) => !e.ignored).length > 0 && (
                <div className="mt-3 space-y-1">
                  {day.events.filter((e) => !e.ignored).map((ev, i) => (
                    <div key={i} className="text-xs text-stone-500 flex gap-2">
                      <span className="font-medium">{ev.startTime}–{ev.endTime}</span>
                      <span>{ev.assignee && <span className="text-stone-400">{ev.assignee}: </span>}{ev.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-3">
            <button
              onClick={() => setResult(null)}
              className="flex-1 py-2.5 rounded-xl border border-stone-300 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
            >
              Re-analyze
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 transition-colors"
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      )}

      {/* Replace confirmation dialog */}
      {showReplaceConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setShowReplaceConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-stone-900">Replace existing schedule?</h3>
            <p className="text-sm text-stone-600">
              The week of {weekLabel} already has schedule entries. Saving will replace them with the newly analyzed duties.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReplaceConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-300 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowReplaceConfirm(false);
                  await doSave();
                }}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 transition-colors"
              >
                {saving ? "Replacing…" : "Replace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
