"use client";

import { useState } from "react";
import { toggleInCart, deleteGroceryItem } from "@/app/(app)/grocery/actions";

interface GroceryItem {
  id: string;
  name: string;
  quantity: string | null;
  in_cart: boolean;
  store_id: string | null;
  stores: { name: string } | null;
}

interface GroceryListProps {
  items: GroceryItem[];
}

export function GroceryList({ items }: GroceryListProps) {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-stone-400">
        <p className="text-sm">Empty list</p>
      </div>
    );
  }

  async function handleToggle(id: string, current: boolean) {
    setOptimistic((prev) => ({ ...prev, [id]: !current }));
    await toggleInCart(id, current);
  }

  async function handleDelete(id: string) {
    setDeleting((prev) => new Set([...prev, id]));
    await deleteGroceryItem(id);
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const inCart = optimistic[item.id] ?? item.in_cart;
        const isDeleting = deleting.has(item.id);
        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-3 rounded-lg border transition-all ${
              inCart
                ? "border-stone-100 bg-stone-50 opacity-50"
                : "border-stone-200 bg-white"
            } ${isDeleting ? "opacity-30" : ""}`}
          >
            {/* Checkbox — min 44×44 tap target per Apple HIG / WCAG 2.5.5 */}
            <button
              onClick={() => handleToggle(item.id, item.in_cart)}
              aria-label={inCart ? "Mark as not purchased" : "Mark as purchased"}
              className="min-w-11 min-h-11 flex items-center justify-center shrink-0"
            >
              <span
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  inCart
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-stone-300 hover:border-amber-400"
                }`}
              >
                {inCart && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>

            <div className="flex-1 min-w-0 py-2.5">
              <span className={`text-sm text-stone-800 ${inCart ? "line-through" : ""}`}>
                {item.name}
              </span>
              {item.quantity && (
                <span className="ml-2 text-xs text-stone-400">{item.quantity}</span>
              )}
            </div>

            {/* Delete — min 44×44 tap target */}
            <button
              onClick={() => handleDelete(item.id)}
              disabled={isDeleting}
              aria-label="Remove item"
              className="min-w-11 min-h-11 flex items-center justify-center text-stone-300 hover:text-rose-400 transition-colors disabled:opacity-30"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
