"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  /**
   * Begin listening as soon as the button mounts. Set by the quick-capture sheet,
   * where the tap that opened the sheet was itself the "start recording" tap —
   * making the user press a second button would put the third tap back.
   */
  autoStart?: boolean;
  /** Bigger hit area for the sheet, where this is the only thing on screen. */
  size?: "sm" | "lg";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;

function getSpeechRecognition(): AnySR {
  if (typeof window === "undefined") return null;
  const w = window as AnySR;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * SpeechRecognition support, read without breaking hydration.
 *
 * Reading `window` during render made this component return `null` on the server
 * and a button on the client, so every load of /capture/new threw React error
 * #418 and re-rendered the subtree. It was the only page error anywhere in the app.
 *
 * useSyncExternalStore is the sanctioned fix: React uses `getServerSnapshot` for
 * the server render *and* for the hydration pass, so both agree, then re-renders
 * with the client snapshot. The store never changes after load, so `subscribe`
 * has nothing to do — it just has to be a stable reference.
 */
const noopSubscribe = () => () => {};
const supportedOnClient = () => getSpeechRecognition() !== null;
const supportedOnServer = () => false;

export function VoiceButton({
  onTranscript,
  autoStart = false,
  size = "sm",
}: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<AnySR>(null);
  const started = useRef(false);

  const supported = useSyncExternalStore(
    noopSubscribe,
    supportedOnClient,
    supportedOnServer
  );

  function start() {
    const SR = getSpeechRecognition();
    if (!SR) return;
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

  // Mount and listen. Declared above the `!supported` bail-out so hook order never
  // changes between a browser that has SpeechRecognition and one that does not —
  // and gated on `supported` rather than on `window`, so it cannot fire during the
  // hydration pass, when the server snapshot still says false.
  // `start` is deliberately not a dependency: this fires once, and re-running it
  // on a later render would cut recognition off mid-sentence.
  useEffect(() => {
    if (!supported || !autoStart || started.current) return;
    started.current = true;
    start();
    return () => recRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, supported]);

  if (!supported) return null;

  return (
    <div>
      <button
        type="button"
        onClick={recording ? stop : start}
        data-testid="voice-button"
        data-recording={recording ? "true" : "false"}
        className={`rounded-xl transition-colors ${size === "lg" ? "p-5" : "p-3"} ${
          recording
            ? "bg-rose-500 text-white animate-pulse"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
        aria-label={recording ? "Stop recording" : "Record voice"}
      >
        {recording ? (
          <svg
            className={size === "lg" ? "w-8 h-8" : "w-5 h-5"}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        ) : (
          <svg
            className={size === "lg" ? "w-8 h-8" : "w-5 h-5"}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
