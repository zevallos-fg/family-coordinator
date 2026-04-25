"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { LoadingState } from "@/components/ui/LoadingState";
import { queryVendorMemory } from "@/app/(app)/vendors/actions";

interface Match {
  vendor_id: string;
  relevance_score: number;
  why_matched: string;
}

interface SearchResult {
  matches: Match[];
  suggestion: string | null;
}

export function VendorMemorySearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const res = await queryVendorMemory(query);

    setLoading(false);

    if (!res.ok) {
      setError(res.error.userMessage);
      return;
    }

    setResult(res.data as SearchResult);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendors by need (e.g. AC repair, plumber...)"
          className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {loading && <LoadingState text="Searching vendor memory..." />}
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {result && !loading && (
        <div className="space-y-3">
          {result.suggestion && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              {result.suggestion}
            </div>
          )}
          {result.matches.length === 0 && (
            <p className="text-sm text-stone-400">No matching vendors found.</p>
          )}
          {result.matches.map((m: Match) => (
            <div key={m.vendor_id} className="p-3 border border-stone-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <a
                  href={`/vendors/${m.vendor_id}`}
                  className="text-sm font-medium text-amber-700 hover:underline"
                >
                  View vendor
                </a>
                <span className="text-xs text-stone-400">
                  {Math.round(m.relevance_score * 100)}% match
                </span>
              </div>
              <p className="text-xs text-stone-500">{m.why_matched}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
