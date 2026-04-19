"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { submitRecap } from "@/app/(app)/caregiver/actions";

interface RecapFormProps {
  shiftId: string;
}

export function RecapForm({ shiftId }: RecapFormProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus("loading");
    const result = await submitRecap(shiftId, text.trim());
    if (result.ok) {
      setStatus("done");
    } else {
      setStatus("error");
      setErrorMsg(result.error ?? "Something went wrong. Please try again.");
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
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="e.g. Leo napped for 2 hours, ate all his lunch, was happy all day. He seemed a little tired by 4pm but a snack helped."
        className="w-full rounded-xl border border-foreground/20 bg-white px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
      />

      {status === "error" && (
        <p className="text-base text-red-600">{errorMsg}</p>
      )}

      <Button
        type="submit"
        disabled={status === "loading" || !text.trim()}
        className="w-full py-4 text-lg rounded-xl"
      >
        {status === "loading" ? "Sending..." : "Send recap"}
      </Button>
    </form>
  );
}
