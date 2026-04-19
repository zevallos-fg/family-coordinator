"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { generateBrief, parseRecap } from "@/app/(app)/caregiver/actions";

interface BriefPreviewProps {
  shiftId: string;
  brief: { content: string; generated_at: string } | null;
  recap: { transcription: string | null; structured_log: object | null; submitted_at: string } | null;
  origin: string;
}

export function BriefPreview({ shiftId, brief, recap, origin }: BriefPreviewProps) {
  const [generating, setGenerating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBrief, setCurrentBrief] = useState(brief);
  const [currentRecap, setCurrentRecap] = useState(recap);

  const shareUrl = `${origin}/caregiver-view/${shiftId}`;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const result = await generateBrief(shiftId);
    if (!result.ok) {
      setError(result.error ?? "Generation failed");
    } else {
      // Optimistic: page will revalidate; meanwhile update local state
      window.location.reload();
    }
    setGenerating(false);
  }

  async function handleParseRecap() {
    setParsing(true);
    setError(null);
    const result = await parseRecap(shiftId);
    if (!result.ok) {
      setError(result.error ?? "Parse failed");
    } else {
      window.location.reload();
    }
    setParsing(false);
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Brief actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleGenerate} disabled={generating}>
          {generating
            ? "Generating..."
            : currentBrief
              ? "Regenerate brief"
              : "Generate brief"}
        </Button>

        {currentBrief && (
          <Button variant="outline" onClick={handleCopyLink}>
            {copied ? "Copied!" : "Copy caregiver link"}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {currentBrief && (
        <div className="rounded-lg border border-foreground/10 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-xs text-foreground/50">
              Generated {new Date(currentBrief.generated_at).toLocaleString()}
            </span>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-700 underline"
            >
              Preview as caregiver →
            </a>
          </div>
          <div className="p-4">
            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80">
              {currentBrief.content}
            </pre>
          </div>
        </div>
      )}

      {/* Recap section */}
      {currentRecap && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-medium">
            Recap submitted{" "}
            <span className="text-foreground/40 font-normal">
              {new Date(currentRecap.submitted_at).toLocaleString()}
            </span>
          </h3>
          {currentRecap.transcription && (
            <div className="rounded-lg border border-foreground/10 bg-emerald-50 p-4">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {currentRecap.transcription}
              </p>
            </div>
          )}
          {!currentRecap.structured_log && currentRecap.transcription && (
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleParseRecap} disabled={parsing}>
                {parsing ? "Parsing..." : "Parse & update kid notes"}
              </Button>
              <span className="text-xs text-foreground/40">
                Runs AI to extract structured data and update kid profile
              </span>
            </div>
          )}
          {currentRecap.structured_log && (
            <div className="rounded-lg border border-foreground/10 p-3">
              <p className="text-xs text-foreground/40 mb-2">Parsed recap</p>
              <pre className="text-xs text-foreground/60 overflow-auto max-h-40">
                {JSON.stringify(currentRecap.structured_log, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
