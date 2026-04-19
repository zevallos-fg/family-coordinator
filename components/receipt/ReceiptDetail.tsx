"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addReceiptItemsToPantryAction } from "@/app/(app)/receipts/actions";

interface ReceiptItem {
  id: string;
  name: string;
  amount: number | null;
  price_cents: number | null;
}

interface Props {
  receiptId: string;
  storeName: string | null;
  purchasedAt: string | null;
  totalCents: number | null;
  imageUrl: string;
  items: ReceiptItem[];
}

export function ReceiptDetail({
  receiptId,
  storeName,
  purchasedAt,
  totalCents,
  imageUrl,
  items,
}: Props) {
  const [addingToPantry, setAddingToPantry] = useState(false);
  const [pantryAdded, setPantryAdded] = useState(false);

  async function handleAddToPantry() {
    setAddingToPantry(true);
    try {
      const result = await addReceiptItemsToPantryAction(receiptId);
      if (result.ok) {
        toast.success(`${result.addedCount} items added to pantry`);
        setPantryAdded(true);
      } else {
        toast.error(result.error ?? "Failed to add to pantry");
      }
    } finally {
      setAddingToPantry(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 rounded-2xl p-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-semibold text-amber-900">{storeName ?? "Unknown store"}</h2>
            <p className="text-sm text-amber-700 mt-0.5">
              {purchasedAt
                ? new Date(purchasedAt).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Date unknown"}
            </p>
          </div>
          <span className="text-xl font-bold text-amber-800">
            {totalCents != null ? `$${(totalCents / 100).toFixed(2)}` : "—"}
          </span>
        </div>
      </div>

      {imageUrl && !imageUrl.startsWith("placeholder://") && (
        <img
          src={imageUrl}
          alt="Receipt photo"
          className="w-full rounded-2xl object-contain max-h-64 border border-stone-100"
        />
      )}

      <div className="space-y-2">
        <h3 className="font-medium text-stone-700">Items ({items.length})</h3>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between items-center bg-white border border-stone-100 rounded-xl px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-stone-800">{item.name}</p>
              {item.amount != null && item.amount !== 1 && (
                <p className="text-xs text-stone-400">Qty: {item.amount}</p>
              )}
            </div>
            <span className="text-sm text-stone-600">
              {item.price_cents != null
                ? `$${(item.price_cents / 100).toFixed(2)}`
                : "—"}
            </span>
          </div>
        ))}
      </div>

      {!pantryAdded && items.length > 0 && (
        <button
          onClick={handleAddToPantry}
          disabled={addingToPantry}
          className="w-full py-3 rounded-xl bg-green-500 text-white font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {addingToPantry ? "Adding to pantry…" : "Add items to pantry"}
        </button>
      )}

      {pantryAdded && (
        <div className="text-center py-3 text-green-700 font-medium text-sm">
          Items added to pantry
        </div>
      )}
    </div>
  );
}
