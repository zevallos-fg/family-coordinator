"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateKidFromObservation } from "@/app/(app)/caregiver/actions";

interface KidUpdateFormProps {
  kidId: string;
  kidName: string;
}

export function KidUpdateForm({ kidId, kidName }: KidUpdateFormProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus("loading");
    const result = await updateKidFromObservation(kidId, text.trim());
    if (result.ok) {
      setStatus("done");
      setMessage("Profile updated.");
      setText("");
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
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (status !== "idle") setStatus("idle");
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

      <Button type="submit" disabled={status === "loading" || !text.trim()}>
        {status === "loading" ? "Updating..." : "Update profile"}
      </Button>
    </form>
  );
}
