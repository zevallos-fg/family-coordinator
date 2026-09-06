"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCapture } from "@/app/(app)/capture/actions";
import { VoiceButton } from "./VoiceButton";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The mic in the bottom bar, one tap from talking.
 *
 * It used to be a link: tap the mic, land on /capture — a list of everything you
 * had not dealt with yet — then "+ New", then a page load, then finally a record
 * button. Three taps and two navigations, and the first thing a microphone showed
 * you was your own backlog.
 *
 * Now the tap opens this and recording is already live. /capture and /capture/new
 * are untouched and still do what they are for: browsing, and typing at length.
 */
export function QuickCaptureSheet({ open, onClose }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [routedToGrocery, setRoutedToGrocery] = useState(false);
  const isVoice = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || status === "saving") return;

    setStatus("saving");
    setError(null);

    const fd = new FormData();
    fd.append("text", trimmed);
    fd.append("voice", isVoice.current ? "true" : "false");

    const res = await saveCapture(fd);

    if (!res.ok) {
      // Never close on a failure: the words are still in the box, and closing
      // would throw away something that was spoken once and cannot be repeated.
      setStatus("idle");
      setError(res.error ?? "Something went wrong.");
      return;
    }

    setRoutedToGrocery(!!res.isGrocery);
    setStatus("done");
    setText("");
    isVoice.current = false;
    router.refresh();

    // Long enough to read where it went, short enough not to be in the way.
    setTimeout(() => {
      setStatus("idle");
      onClose();
    }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        data-testid="quick-capture"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl border-t border-stone-200 bg-white px-4 pt-4 shadow-2xl sm:mb-6 sm:rounded-2xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-800">Capture</h2>
            <p className="text-[11px] text-stone-400">
              Speak or type. Grocery items route themselves.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-lg px-2 py-1 text-xl leading-none text-stone-400 active:bg-stone-100"
          >
            ×
          </button>
        </div>

        <div className="flex items-start gap-3">
          <VoiceButton
            autoStart
            size="lg"
            onTranscript={(t) => {
              isVoice.current = true;
              setText((prev) => (prev ? prev + " " + t : t));
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="Listening… or type it"
            rows={3}
            className="flex-1 resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        {status === "done" && (
          <p className="mt-3 text-sm text-emerald-600">
            {routedToGrocery ? "Routed to your grocery list." : "Saved to Organized."}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <Link
            href="/capture"
            onClick={onClose}
            className="text-xs text-stone-400 underline underline-offset-2"
          >
            Browse captures
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || status === "saving"}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white disabled:bg-stone-300"
          >
            {status === "saving" ? "Routing…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
