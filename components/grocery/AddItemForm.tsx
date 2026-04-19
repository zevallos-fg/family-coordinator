"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGroceryItemFromText } from "@/app/(app)/grocery/actions";

export function AddItemForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "parsing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  async function submit() {
    if (!text.trim()) return;
    setStatus("parsing");
    setError(null);

    const fd = new FormData();
    fd.append("text", text);

    const res = await addGroceryItemFromText(fd);
    setStatus("idle");

    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }

    setCount(res.count ?? 1);
    setText("");
    setStatus("done");
    startTransition(() => router.refresh());
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. 2 gallons of milk at Costco, bananas, eggs"
          className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          disabled={status === "parsing"}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || status === "parsing"}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
        >
          {status === "parsing" ? "Parsing…" : "Add"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      {status === "done" && count !== null && (
        <p className="text-xs text-emerald-600 mt-2">
          Added {count} {count === 1 ? "item" : "items"}!
        </p>
      )}
      <p className="text-xs text-stone-400 mt-1.5">
        Claude parses quantities, units, and store preferences automatically.
      </p>
    </div>
  );
}
