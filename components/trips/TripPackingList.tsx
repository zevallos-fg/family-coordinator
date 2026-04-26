"use client";

import { useState } from "react";
import { togglePackingItem } from "@/app/(app)/trips/actions";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

interface PackingItem {
  id: string;
  item: string;
  notes: string | null;
  packed: boolean;
}

interface TripPackingListProps {
  tripId: string;
  items: PackingItem[];
}

function parseOwnerCategory(notes: string | null): { owner: string; category: string } {
  if (!notes) return { owner: "shared", category: "Shared Essentials" };
  const parts = notes.split("|");
  let owner = "shared";
  let category = "Shared Essentials";
  for (const part of parts) {
    if (part.startsWith("owner:")) owner = part.replace("owner:", "");
    if (part.startsWith("category:")) category = part.replace("category:", "");
  }
  return { owner, category };
}

function groupByOwner(items: PackingItem[]): Record<string, PackingItem[]> {
  const groups: Record<string, PackingItem[]> = {};
  for (const item of items) {
    const { owner } = parseOwnerCategory(item.notes);
    if (!groups[owner]) groups[owner] = [];
    groups[owner].push(item);
  }
  return groups;
}

export function TripPackingList({ items: initialItems }: TripPackingListProps) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(itemId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, packed: !item.packed } : item
      )
    );

    const result = await togglePackingItem(itemId);
    if (!result.ok) {
      // Revert optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, packed: !item.packed } : item
        )
      );
      setError(result.error.userMessage);
    }
  }

  const groups = groupByOwner(items);

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {Object.entries(groups).map(([owner, ownerItems]) => (
        <div key={owner} className="space-y-2">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
            {owner.startsWith("kid_") ? owner.replace("kid_", "") + " (kid)" : owner}
          </h3>
          {ownerItems.map((item) => {
            const { category } = parseOwnerCategory(item.notes);
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                  item.packed
                    ? "border-stone-100 bg-stone-50"
                    : "border-stone-200 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.packed}
                  onChange={() => handleToggle(item.id)}
                  className="w-4 h-4 accent-amber-600"
                />
                <div className="flex-1">
                  <span
                    className={`text-sm ${
                      item.packed ? "line-through text-stone-400" : "text-stone-700"
                    }`}
                  >
                    {item.item}
                  </span>
                  <span className="ml-2 text-xs text-stone-400">{category}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
