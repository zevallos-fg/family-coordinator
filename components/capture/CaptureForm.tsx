"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCapture } from "@/app/(app)/capture/actions";
import { VoiceButton } from "./VoiceButton";

export function CaptureForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ isGrocery?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const isVoice = useRef(false);

  async function submit() {
    if (!text.trim()) return;
    setStatus("saving");
    setError(null);

    const fd = new FormData();
    fd.append("text", text);
    fd.append("voice", isVoice.current ? "true" : "false");

    const res = await saveCapture(fd);
    setStatus("idle");

    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }

    setLastResult({ isGrocery: res.isGrocery });
    setText("");
    isVoice.current = false;
    setStatus("done");
    startTransition(() => router.refresh());
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <h2 className="font-medium text-stone-700">What&apos;s on your mind?</h2>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="Type anything… grocery items are auto-sorted to your list"
          rows={3}
          className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
        <div className="flex flex-col gap-2 justify-end">
          <VoiceButton
            onTranscript={(t) => {
              isVoice.current = true;
              setText((prev) => (prev ? prev + " " + t : t));
            }}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {status === "done" && (
        <p className="text-sm text-emerald-600">
          {lastResult?.isGrocery
            ? "Routed to your grocery list!"
            : "Saved to Organized!"}
        </p>
      )}

      <div className="flex justify-between items-center">
        <p className="text-xs text-stone-400">
          Grocery items auto-routed
          <span className="hidden sm:inline"> · Cmd+Enter to save</span>
        </p>
        <button
          onClick={submit}
          disabled={!text.trim() || status === "saving" || isPending}
          className="px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
        >
          {status === "saving" ? "Routing…" : "Save"}
        </button>
      </div>
    </div>
  );
}
