"use client";

import { useState, useEffect, useRef } from "react";
import { addPantryItemAction, searchIngredientsAction } from "@/app/(app)/meal-plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Suggestion { id: string; name: string }

export function PantryAddForm({ onAdded }: { onAdded?: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!name.trim()) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const results = await searchIngredientsAction(name.trim());
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Ingredient name is required"); return; }

    setLoading(true);
    const result = await addPantryItemAction({
      ingredientName: name.trim().toLowerCase(),
      amount: amount ? parseFloat(amount) : null,
      unit: unit.trim() || null,
      expiresOn: expiresOn || null,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setName("");
      setAmount("");
      setUnit("");
      setExpiresOn("");
      setSuggestions([]);
      onAdded?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Add to Pantry</h3>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Ingredient name with autocomplete */}
        <div className="sm:col-span-2 relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">Ingredient</label>
          <Input
            placeholder="e.g. olive oil"
            value={name}
            onChange={e => { setName(e.target.value); setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoComplete="off"
            className="lowercase"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {suggestions.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 capitalize"
                    onMouseDown={() => { setName(s.name); setShowSuggestions(false); }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="2"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
          <Input
            placeholder="cups, oz…"
            value={unit}
            onChange={e => setUnit(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Expires (optional)</label>
          <Input
            type="date"
            value={expiresOn}
            onChange={e => setExpiresOn(e.target.value)}
            className="w-40"
          />
        </div>
        <Button type="submit" disabled={loading} className="mb-0">
          {loading ? "Adding…" : "Add Item"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </form>
  );
}
