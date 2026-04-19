"use client";

import { useState } from "react";
import { updatePantryItemAction, removePantryItemAction } from "@/app/(app)/meals/actions";

interface PantryItem {
  id: string;
  ingredientName: string;
  amount: number | null;
  unit: string | null;
  expiresOn: string | null;
}

function formatExpiry(expiresOn: string | null): string {
  if (!expiresOn) return "";
  const d = new Date(expiresOn);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `${diffDays}d left`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ExpiryBadge({ expiresOn }: { expiresOn: string | null }) {
  if (!expiresOn) return null;
  const d = new Date(expiresOn);
  const diffDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const isWarning = diffDays <= 3;
  const label = formatExpiry(expiresOn);
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isWarning ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
      {label}
    </span>
  );
}

function PantryRow({ item, onUpdated }: { item: PantryItem; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(item.amount ?? ""));
  const [saving, setSaving] = useState(false);

  async function saveAmount() {
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    await updatePantryItemAction(item.id, num);
    setSaving(false);
    setEditing(false);
    onUpdated();
  }

  async function handleRemove() {
    if (!confirm(`Remove ${item.ingredientName} from pantry?`)) return;
    await removePantryItemAction(item.id);
    onUpdated();
  }

  return (
    <tr className="border-b border-gray-50 hover:bg-orange-50/30 transition-colors">
      <td className="px-4 py-3">
        <span className="font-medium text-gray-800 capitalize">{item.ingredientName}</span>
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-20 border border-orange-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") saveAmount(); if (e.key === "Escape") setEditing(false); }}
            />
            <button onClick={saveAmount} disabled={saving} className="text-xs text-green-600 hover:text-green-800 font-medium">
              {saving ? "…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-gray-600 hover:text-orange-700 transition-colors"
          >
            {item.amount !== null ? `${item.amount}${item.unit ? ` ${item.unit}` : ""}` : "—"}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        <ExpiryBadge expiresOn={item.expiresOn} />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={handleRemove}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

export function PantryList({ items, onRefresh }: { items: PantryItem[]; onRefresh?: () => void }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">🥫</div>
        <p className="font-medium text-gray-500">Pantry is empty</p>
        <p className="text-sm mt-1">Add items above to track what you have on hand.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-orange-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-orange-50 text-left">
            <th className="px-4 py-3 font-semibold text-gray-600">Ingredient</th>
            <th className="px-4 py-3 font-semibold text-gray-600">Quantity</th>
            <th className="px-4 py-3 font-semibold text-gray-600">Expires</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <PantryRow key={item.id} item={item} onUpdated={onRefresh ?? (() => {})} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
