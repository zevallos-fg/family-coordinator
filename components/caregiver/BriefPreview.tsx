"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  generateBrief,
  parseRecap,
  createShiftShareLink,
} from "@/app/(app)/caregiver/actions";

interface BriefPreviewProps {
  shiftId: string;
  brief: { content: string; generated_at: string } | null;
  recap: { transcription: string | null; structured_log: object | null; submitted_at: string } | null;
}

export function BriefPreview({ shiftId, brief, recap }: BriefPreviewProps) {
  const [generating, setGenerating] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBrief, setCurrentBrief] = useState(brief);
  const [currentRecap, setCurrentRecap] = useState(recap);
  const [minting, setMinting] = useState(false);
  // Shown once, on creation, and never again. The token IS the credential, so
  // re-displaying it would turn revocation into theatre.
  const [freshLink, setFreshLink] = useState<{ url: string; expiresAt: string } | null>(
    null
  );

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

  async function handleCreateLink() {
    setMinting(true);
    setError(null);
    const result = await createShiftShareLink(shiftId);
    setMinting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFreshLink({ url: result.url, expiresAt: result.expiresAt });
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked outside a secure context, and on iOS outside a user gesture. The
      // URL is on screen either way, so say so rather than fail silently.
      setError("Couldn't copy — select the link and copy it by hand.");
    }
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
          <Button variant="outline" onClick={handleCreateLink} disabled={minting}>
            {minting ? "Creating…" : "Create caregiver link"}
          </Button>
        )}
      </div>

      {freshLink && (
        <div
          data-testid="fresh-caregiver-link"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-xs font-medium text-amber-900">
            Copy this now — it is not shown again. Expires{" "}
            {new Date(freshLink.expiresAt).toLocaleString()}.
          </p>
          <p className="break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-foreground/70">
            {freshLink.url}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleCopy(freshLink.url)}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button variant="outline" onClick={() => setFreshLink(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {currentBrief && (
        <div className="rounded-lg border border-foreground/10 overflow-hidden">
          <div className="bg-amber-50 px-4 py-2 border-b border-foreground/10 flex items-center justify-between">
            <span className="text-xs text-foreground/50">
              Generated {new Date(currentBrief.generated_at).toLocaleString()}
            </span>
            {freshLink && (
              <a
                href={freshLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-700 underline"
              >
                Open as caregiver →
              </a>
            )}
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
