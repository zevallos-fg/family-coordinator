"use client";

import { useState } from "react";
import type { ParsedReceipt } from "@/app/(app)/receipts/actions";

interface Props {
  parsed: ParsedReceipt;
  imageBase64: string;
  imageMimeType: string;
  knownStores: Array<{ id: string; name: string }>;
  onConfirm: (data: ConfirmedReceiptData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export interface ConfirmedReceiptData {
  imageBase64: string;
  imageMimeType: string;
  storeId: string | null;
  storeName: string | null;
  receiptDate: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number;
    category: string | null;
  }>;
  total: number;
}

export function ReceiptParsePreview({
  parsed,
  imageBase64,
  imageMimeType,
  knownStores,
  onConfirm,
  onCancel,
  saving,
}: Props) {
  const [storeId, setStoreId] = useState(parsed.storeId ?? "");
  const [storeName, setStoreName] = useState(parsed.storeName ?? "");
  const [receiptDate, setReceiptDate] = useState(parsed.receiptDate ?? "");
  const [items, setItems] = useState(parsed.items);

  function updateItem(
    index: number,
    field: keyof (typeof items)[0],
    value: string | number | null
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    const selectedStore = knownStores.find((s) => s.id === storeId);
    await onConfirm({
      imageBase64,
      imageMimeType,
      storeId: selectedStore?.id ?? null,
      storeName: (selectedStore?.name ?? storeName) || null,
      receiptDate: receiptDate || null,
      items,
      total: parsed.total,
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold text-amber-900">Review parsed receipt</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-amber-700 mb-1">Store</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Unknown store</option>
              {knownStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!storeId && (
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Store name (optional)"
                className="mt-2 w-full rounded-xl border border-amber-200 px-3 py-2 text-sm bg-white"
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-amber-700 mb-1">Date</label>
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-medium text-stone-800">
            Items ({items.length})
          </h3>
          <span className="text-sm text-amber-700 font-medium">
            Total: ${parsed.total.toFixed(2)}
          </span>
        </div>

        {items.map((item, i) => (
          <div
            key={i}
            className="bg-white border border-stone-100 rounded-xl p-3 flex gap-3 items-start"
          >
            <div className="flex-1 space-y-1">
              <input
                value={item.name}
                onChange={(e) => updateItem(i, "name", e.target.value)}
                className="w-full text-sm font-medium text-stone-800 border-b border-stone-100 focus:outline-none focus:border-amber-300 pb-0.5"
              />
              <div className="flex gap-2 text-xs text-stone-500">
                <span>Qty:</span>
                <input
                  type="number"
                  value={item.quantity}
                  min={1}
                  onChange={(e) => updateItem(i, "quantity", Number(e.target.value))}
                  className="w-12 border-b border-stone-100 focus:outline-none focus:border-amber-300 text-center"
                />
                <span className="ml-2">Total: $</span>
                <input
                  type="number"
                  value={item.totalPrice}
                  step="0.01"
                  min={0}
                  onChange={(e) => updateItem(i, "totalPrice", Number(e.target.value))}
                  className="w-16 border-b border-stone-100 focus:outline-none focus:border-amber-300"
                />
              </div>
            </div>
            <button
              onClick={() => removeItem(i)}
              className="text-stone-300 hover:text-red-400 text-lg leading-none"
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save receipt"}
        </button>
      </div>
    </div>
  );
}
