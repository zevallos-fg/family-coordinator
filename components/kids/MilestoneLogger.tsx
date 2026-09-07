"use client";

import { useState } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { logMilestone, confirmAndSaveMilestone } from "@/app/(app)/kids/actions";
import type { Output as MilestoneOutput } from "@/skills/family-kid-milestone";

interface MilestoneLoggerProps {
  kidId: string;
}

type Stage = "idle" | "loading" | "review" | "saving";

export function MilestoneLogger({ kidId }: MilestoneLoggerProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [milestoneText, setMilestoneText] = useState("");
  const [skillOutput, setSkillOutput] = useState<MilestoneOutput | null>(null);

  async function handleAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStage("loading");
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await logMilestone(kidId, formData);

    if (!result.ok) {
      setError(result.error.userMessage);
      setStage("idle");
      return;
    }

    setMilestoneText(result.data.milestone_text);
    setSkillOutput(result.data.skillOutput);
    setStage("review");
  }

  async function handleConfirm() {
    if (!skillOutput) return;
    setStage("saving");

    const result = await confirmAndSaveMilestone(kidId, milestoneText, skillOutput);

    if (!result.ok) {
      setError(result.error.userMessage);
      setStage("review");
      return;
    }

    setStage("idle");
    setMilestoneText("");
    setSkillOutput(null);
    window.location.reload();
  }

  if (stage === "loading") return <LoadingState text="Analyzing milestone..." />;

  return (
    <div className="border border-stone-200 rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-medium text-stone-700">Log a Milestone</h2>

      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {stage === "idle" && (
        <form onSubmit={handleAnalyze} className="space-y-3">
          {/*
            Uncontrolled on purpose. handleAnalyze already reads this through
            `new FormData(e.currentTarget)` — the DOM was always the real source
            here — and `milestoneText` is then overwritten by what the server
            sends back for the review step. The controlled binding bought nothing
            and cost the words typed before hydration, which is a description of
            a child's first sentence.

            `required` keeps an empty submit from going anywhere, and the browser
            enforces it whether or not JavaScript has arrived.
          */}
          <textarea
            name="milestone_text"
            rows={3}
            required
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            placeholder="Describe what happened... e.g. 'Leo said his first two-word sentence today'"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            Analyze Milestone
          </button>
        </form>
      )}

      {stage === "review" && skillOutput && (
        <div className="space-y-4">
          {/* Followup warning */}
          {skillOutput.requires_pediatrician_followup && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800">Discuss with pediatrician</p>
              <p className="text-xs text-yellow-700 mt-1">{skillOutput.followup_reason}</p>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-stone-600">Type:</span>{" "}
              <span className="text-stone-700">{skillOutput.milestone_type}</span>
            </div>
            <div>
              <span className="font-medium text-stone-600">Description:</span>{" "}
              <span className="text-stone-700">{skillOutput.normalized_description}</span>
            </div>
            <div>
              <span className="font-medium text-stone-600">Age appropriate:</span>{" "}
              <span className={skillOutput.age_appropriate ? "text-green-600" : "text-orange-600"}>
                {skillOutput.age_appropriate ? "Yes" : "No — may be early or late"}
              </span>
            </div>
            {skillOutput.suggested_celebration && (
              <div>
                <span className="font-medium text-stone-600">Celebration idea:</span>{" "}
                <span className="text-stone-500 italic">{skillOutput.suggested_celebration}</span>
              </div>
            )}
            {skillOutput.related_milestones_to_watch_for.length > 0 && (
              <div>
                <span className="font-medium text-stone-600">Watch for next:</span>{" "}
                <span className="text-stone-500">{skillOutput.related_milestones_to_watch_for.join(", ")}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              Save Milestone
            </button>
            <button
              onClick={() => { setStage("idle"); setSkillOutput(null); }}
              className="px-4 py-2 border border-stone-300 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "saving" && <LoadingState text="Saving milestone..." />}
    </div>
  );
}
