"use client";

import { useEffect, useState } from "react";

// Module-level cache: deduplicates across component mount/unmount cycles
// within the same browser session tab.
let moduleCache: { value: string; fetchedAt: number } | null = null;
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function SpendIndicator() {
  const [spend, setSpend] = useState<string | null>(moduleCache?.value ?? null);

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
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const value = data.spend ?? null;
        if (value !== null) {
          moduleCache = { value, fetchedAt: Date.now() };
        }
        if (!cancelled) setSpend(value);
      } catch {
        // silently fail — spend indicator is non-critical
      }
    }

    fetchSpend();
    const id = setInterval(fetchSpend, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (spend === null) return null;

  return (
    <span className="text-xs text-stone-500 tabular-nums">
      ${spend} / $10.00
    </span>
  );
}
