"use client";

import { useState } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { generateDigest, convertBlindSpotToTask } from "@/app/(app)/digest/actions";
import type { BlindSpot } from "@/skills/family-weekly-digest";

interface Digest {
  id: string;
  week_start_date: string;
  content: string;
  blind_spots: unknown;
  sent_at: string | null;
  created_at: string;
}

interface DigestViewProps {
  digests: Digest[];
  currentWeek: string;
}

export function DigestView({ digests: initialDigests, currentWeek }: DigestViewProps) {
  const [digests, setDigests] = useState(initialDigests);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDigest, setSelectedDigest] = useState<Digest | null>(
    initialDigests[0] ?? null
  );
  const [taskCreated, setTaskCreated] = useState<Record<number, string>>({});

  const currentWeekExists = digests.some((d) => d.week_start_date === currentWeek);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    const result = await generateDigest(currentWeek);

    setGenerating(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    window.location.reload();
  }

  async function handleConvertToTask(digestId: string, blindSpotIndex: number) {
    const result = await convertBlindSpotToTask(digestId, blindSpotIndex);
    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }
    setTaskCreated((prev) => ({ ...prev, [blindSpotIndex]: result.data.task_id }));
  }

  const blindSpots = selectedDigest?.blind_spots as BlindSpot[] | null;

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {/* Generate + archive selector */}
      <div className="flex items-center gap-3 flex-wrap">
        {!currentWeekExists && !generating && (
          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
          >
            Generate this week's digest
          </button>
        )}
        {digests.length > 0 && (
          <select
            value={selectedDigest?.id ?? ""}
            onChange={(e) => {
              const d = digests.find((d) => d.id === e.target.value);
              setSelectedDigest(d ?? null);
              setTaskCreated({});
            }}
            className="px-3 py-2 border border-stone-300 rounded-lg text-sm"
          >
            {digests.map((d) => (
              <option key={d.id} value={d.id}>
                Week of {d.week_start_date}
                {d.week_start_date === currentWeek ? " (current)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {generating && <LoadingState text="Generating weekly digest..." />}

      {/* Digest content */}
      {selectedDigest && !generating && (
        <div className="space-y-6">
          {/* Markdown-rendered content */}
          <div className="p-6 border border-stone-200 rounded-xl prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700 leading-relaxed">
              {selectedDigest.content}
            </pre>
          </div>

          {/* Blind spots */}
          {blindSpots && blindSpots.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-stone-600 uppercase tracking-wide">
                Blind Spots ({blindSpots.length})
              </h2>
              {blindSpots.map((spot, i) => (
                <div key={i} className="p-4 border border-amber-200 bg-amber-50 rounded-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                        {spot.category}
                      </p>
                      <p className="text-sm text-stone-700">{spot.observation}</p>
                      <p className="text-xs text-stone-500 mt-1 italic">
                        → {spot.suggested_action}
                      </p>
                    </div>
                    {taskCreated[i] ? (
                      <span className="text-xs text-green-600 font-medium shrink-0">
                        Task created
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConvertToTask(selectedDigest.id, i)}
                        className="text-xs text-amber-700 hover:underline shrink-0 font-medium"
                      >
                        Convert to task
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load attribution */}
          {(() => {
            // Parse load attribution from content if not in blind_spots
            return null;
          })()}

          {/* Actions */}
          <div className="flex gap-2">
            {!selectedDigest.sent_at && (
              <span className="text-xs text-stone-400 italic">
                Not marked sent yet (email delivery coming in v35)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
