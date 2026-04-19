"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { LookupBarcodeResult } from "@/app/(app)/barcode/actions";
import {
  addBarcodeToPantryAction,
  addBarcodeToGroceryAction,
} from "@/app/(app)/barcode/actions";

interface Props {
  barcode: string;
  result: LookupBarcodeResult;
  onScanAgain: () => void;
}

export function BarcodeResult({ barcode, result, onScanAgain }: Props) {
  const [addedToPantry, setAddedToPantry] = useState(false);
  const [addedToGrocery, setAddedToGrocery] = useState(false);
  const [editName, setEditName] = useState(result.productName ?? "");
  const [editing, setEditing] = useState(!result.productName || result.confidence === "low");
  const [loading, setLoading] = useState<"pantry" | "grocery" | null>(null);

  const displayName = editName || `Unknown (${barcode})`;

  async function handleAddToPantry() {
    if (!displayName) return;
    setLoading("pantry");
    try {
      const r = await addBarcodeToPantryAction(barcode, displayName, result.brand);
      if (r.ok) {
        toast.success(`${displayName} added to pantry`);
        setAddedToPantry(true);
      } else {
        toast.error(r.error ?? "Failed to add to pantry");
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleAddToGrocery() {
    if (!displayName) return;
    setLoading("grocery");
    try {
      const r = await addBarcodeToGroceryAction(displayName);
      if (r.ok) {
        toast.success(`${displayName} added to grocery list`);
        setAddedToGrocery(true);
      } else {
        toast.error(r.error ?? "Failed to add to grocery list");
      }
    } finally {
      setLoading(null);
    }
  }

  const confidenceBadge = result.confidence === "high"
    ? "bg-green-100 text-green-700"
    : result.confidence === "medium"
    ? "bg-amber-100 text-amber-700"
    : "bg-stone-100 text-stone-500";

  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-5 space-y-4">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {editing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter product name"
              className="text-lg font-semibold text-stone-800 border-b border-amber-200 focus:outline-none focus:border-amber-400 w-full pb-0.5"
              autoFocus
            />
          ) : (
            <h3 className="text-lg font-semibold text-stone-800">{displayName}</h3>
          )}
          {result.brand && (
            <p className="text-sm text-stone-500 mt-0.5">{result.brand}</p>
          )}
        </div>
        {result.confidence && (
          <span className={`text-xs px-2 py-1 rounded-full ml-3 ${confidenceBadge}`}>
            {result.confidence}
          </span>
        )}
      </div>

      {result.note && (
        <p className="text-xs text-stone-400 italic">{result.note}</p>
      )}

      <p className="text-xs text-stone-400 font-mono">{barcode}</p>

      {editing ? (
        <button
          onClick={() => setEditing(false)}
          className="w-full py-2 rounded-xl bg-amber-100 text-amber-800 text-sm font-medium"
        >
          Confirm name
        </button>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-amber-600 hover:underline"
        >
          Wrong product? Edit name
        </button>
      )}

      {!editing && (
        <div className="flex gap-3">
          <button
            onClick={handleAddToPantry}
            disabled={addedToPantry || loading === "pantry"}
            className="flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50"
          >
            {addedToPantry ? "In pantry" : loading === "pantry" ? "Adding…" : "+ Pantry"}
          </button>
          <button
            onClick={handleAddToGrocery}
            disabled={addedToGrocery || loading === "grocery"}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
          >
            {addedToGrocery ? "In grocery list" : loading === "grocery" ? "Adding…" : "+ Grocery"}
          </button>
        </div>
      )}

      <button
        onClick={onScanAgain}
        className="w-full py-2 rounded-xl border border-stone-200 text-stone-500 text-sm hover:bg-stone-50"
      >
        Scan another
      </button>
    </div>
  );
}
