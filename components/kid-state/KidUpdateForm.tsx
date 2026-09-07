"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateKidFromObservation } from "@/app/(app)/caregiver/actions";

interface KidUpdateFormProps {
  kidId: string;
  kidName: string;
}

/**
 * The textarea is uncontrolled and the button is never disabled for being empty,
 * for the reason spelled out in RecapForm and AddItemForm: a controlled field
 * discards anything typed before hydration, and React seeds its input tracker
 * from the DOM at that moment, so re-typing the same words fires no change event
 * and cannot recover them.
 *
 * What is at stake here is a sentence someone wrote about their child. Emptiness
 * is checked on submit, where it can say something useful.
 */
export function KidUpdateForm({ kidId, kidName }: KidUpdateFormProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = textRef.current?.value.trim() ?? "";
    if (!text) {
      setStatus("error");
      setMessage(`Write a line about ${kidName} first.`);
      return;
    }
    setStatus("loading");
    const result = await updateKidFromObservation(kidId, text);
    if (result.ok) {
      setStatus("done");
      setMessage("Profile updated.");
      if (textRef.current) textRef.current.value = "";
    } else {
      setStatus("error");
      setMessage(result.error ?? "Something went wrong");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="observation">
          What&apos;s new with {kidName}?
        </label>
        <textarea
          id="observation"
          ref={textRef}
          onChange={() => {
            if (status !== "idle") {
              setStatus("idle");
              setMessage("");
            }
          }}
          rows={3}
          placeholder={`e.g. "${kidName} is really into dinosaurs this week" or "she hates broccoli now"`}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
        />
      </div>

      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-600" : "text-green-700"}`}>
          {message}
        </p>
      )}

      <Button type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Updating..." : "Update profile"}
      </Button>
    </form>
  );
}
