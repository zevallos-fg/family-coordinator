"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addGroceryItemFromText, previewDedup } from "@/app/(app)/grocery/actions";

interface AddItemFormProps {
  familyId: string;
}

export function AddItemForm({ familyId }: AddItemFormProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "parsing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    willMerge: boolean;
    existingItem?: { name: string; qty_value: number | null; qty_unit: string | null };
  } | null>(null);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!text.trim()) {
        setMergePreview(null);
        return;
      }
      const result = await previewDedup(text.trim(), familyId);
      setMergePreview(result);
    }, 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, familyId]);

  async function submit() {
    if (!text.trim()) return;
    setStatus("parsing");
    setError(null);

    const fd = new FormData();
    fd.append("text", text);

    const res = await addGroceryItemFromText(fd);
    setStatus("idle");
    setMergePreview(null);

    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }

    const action = res.action;
    const name = res.name ?? text;
    if (action === "merged") {
      toast.success(`Merged into ${name}`);
    } else if (action === "review_required") {
      toast.info(`Added ${name} — needs review (different unit)`);
    } else {
      toast.success(`Added ${name}`);
    }

    setText("");
    setStatus("done");
    startTransition(() => router.refresh());
    setTimeout(() => setStatus("idle"), 2000);
  }

  const willMerge = mergePreview?.willMerge ?? false;

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
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {status === "parsing" ? "Parsing…" : willMerge ? "Add & merge" : "Add"}
        </button>
      </div>

      {willMerge && mergePreview?.existingItem && (
        <div className="mt-2 bg-teal-50 border border-teal-200 rounded-md px-3 py-1.5 text-sm text-teal-700">
          ✓ Will merge with existing {mergePreview.existingItem.name}
          {mergePreview.existingItem.qty_value !== null && (
            <span className="text-teal-600">
              {" "}({mergePreview.existingItem.qty_value}
              {mergePreview.existingItem.qty_unit ? " " + mergePreview.existingItem.qty_unit : ""})
            </span>
          )}
        </div>
      )}

      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      <p className="text-xs text-stone-400 mt-1.5">
        Claude parses quantities, units, and store preferences automatically.
      </p>
    </div>
  );
}
