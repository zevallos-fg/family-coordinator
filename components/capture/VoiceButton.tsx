"use client";

import { useRef, useState } from "react";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<AnySR>(null);

  const w = typeof window !== "undefined" ? (window as AnySR) : null;
  const SR: AnySR = w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;

  if (!SR) return null;

  function start() {
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onstart = () => { setRecording(true); setError(null); };
    rec.onend = () => setRecording(false);
    rec.onerror = (e: AnySR) => {
      setRecording(false);
      if (e.error === "not-allowed") {
        setError("Microphone blocked. Check permissions.");
      } else {
        setError(`Voice error: ${e.error}`);
      }
    };
    rec.onresult = (e: AnySR) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    recRef.current = rec;
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
    setRecording(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={recording ? stop : start}
        className={`p-3 rounded-xl transition-colors ${
          recording
            ? "bg-rose-500 text-white animate-pulse"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
        aria-label={recording ? "Stop recording" : "Record voice"}
      >
        {recording ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
