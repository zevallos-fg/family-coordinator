"use client";

import { useEffect, useState } from "react";

// Module-level cache: deduplicates across component mount/unmount cycles
// within the same browser session tab.
let moduleCache: { value: string; fetchedAt: number } | null = null;
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function SpendIndicator() {
  const [spend, setSpend] = useState<string | null>(moduleCache?.value ?? null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchSpend() {
      const now = Date.now();
      if (moduleCache && now - moduleCache.fetchedAt < REFRESH_MS) {
        setSpend(moduleCache.value);
        return;
      }
      try {
        const res = await fetch("/api/spend");
        if (cancelled) return;
        const data = await res.json().catch(() => null);

        // The route answers 503 when it could not read the spend. Showing the
        // last known figure then would be a stale number wearing a live label,
        // and showing $0.00 would be worse — so say the budget is unreadable.
        if (!res.ok || data?.unavailable) {
          setUnavailable(true);
          return;
        }

        const value = data?.spend ?? null;
        if (value !== null) {
          moduleCache = { value, fetchedAt: Date.now() };
        }
        setUnavailable(false);
        setSpend(value);
      } catch {
        // Offline or the request never landed. Not the same as the server saying
        // it cannot read the budget, so this stays quiet rather than alarming.
        if (!cancelled) setUnavailable(false);
      }
    }

    fetchSpend();
    const id = setInterval(fetchSpend, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (unavailable) {
    return (
      <span className="text-xs text-amber-700 tabular-nums" title="The monthly AI spend could not be read">
        spend unavailable
      </span>
    );
  }

  if (spend === null) return null;

  return (
    <span className="text-xs text-stone-500 tabular-nums">
      ${spend} / $10.00
    </span>
  );
}
