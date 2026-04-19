"use client";

import { useEffect, useState } from "react";

export function SpendIndicator() {
  const [spend, setSpend] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSpend() {
      try {
        const res = await fetch("/api/spend");
        if (!res.ok) return;
        const data = await res.json();
        setSpend(data.spend ?? null);
      } catch {
        // silently fail — spend indicator is non-critical
      }
    }
    fetchSpend();
    const id = setInterval(fetchSpend, 60_000);
    return () => clearInterval(id);
  }, []);

  if (spend === null) return null;

  return (
    <span className="text-xs text-stone-500 tabular-nums">
      ${spend} / $10.00
    </span>
  );
}
