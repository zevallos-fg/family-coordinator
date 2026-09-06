"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitSharedRecap } from "@/app/caregiver-view/actions";

interface RecapFormProps {
  /** The share token, not the shift id — the caregiver never sees a row id. */
  token: string;
}

/**
 * The textarea is UNCONTROLLED, and the submit button is never disabled for being
 * empty. Both on purpose.
 *
 * A controlled input whose submit is gated on React state is unusable until the
 * page hydrates, and — worse — anything typed before then is silently discarded:
 * the DOM has the text, React's state does not, and React never reads it back. On
 * a public page whose entire audience is someone opening a link on a phone, on
 * whatever connection they have, that is the wrong trade. The DOM is the source
 * of truth here, so the words survive however slowly the JavaScript arrives.
 *
 * Emptiness is checked on submit instead, where it can say something useful.
 */
export function RecapForm({ token }: RecapFormProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = textRef.current?.value.trim() ?? "";
    if (!text) {
      setStatus("error");
      setErrorMsg("Please write a little about the day first.");
      return;
    }
    setStatus("loading");
    const result = await submitSharedRecap(token, text);
    if (result.ok) {
      setStatus("done");
    } else {
      setStatus("error");
      setErrorMsg(result.error);
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-8 text-center space-y-3">
        <div className="text-5xl">✓</div>
        <p className="text-2xl font-semibold text-emerald-800">Sent!</p>
        <p className="text-lg text-emerald-700">
          The family has been notified. Thank you for today!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <textarea
        ref={textRef}
        name="recap"
        rows={5}
        placeholder="e.g. Napped for 2 hours, ate all his lunch, was happy all day. Seemed a little tired by 4pm but a snack helped."
        className="w-full rounded-xl border border-foreground/20 bg-white px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
      />

      {status === "error" && (
        <p className="text-base text-red-600">{errorMsg}</p>
      )}

      <Button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-4 text-lg rounded-xl"
      >
        {status === "loading" ? "Sending..." : "Send recap"}
      </Button>
    </form>
  );
}
