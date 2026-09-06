"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Store {
  id: string;
  name: string;
}

interface StoreFilterProps {
  stores: Store[];
}

/**
 * You shop at the same store most weeks. Making you re-pick it every time is the
 * same small tax as a timer that forgets which side you fed from last.
 */
const LAST_FILTER_KEY = "grocery:last-store-filter";

/**
 * Shared with AddItemForm. Two keys because they answer different questions: the filter
 * remembers "all" and "none" as valid views, while the add form needs a real destination.
 */
const LAST_STORE_KEY = "grocery:last-store";

function readLastFilter(): string | null {
  try {
    return window.localStorage.getItem(LAST_FILTER_KEY);
  } catch {
    return null; // private mode, storage disabled — just don't remember
  }
}

export function StoreFilter({ stores }: StoreFilterProps) {
  const router = useRouter();
  const params = useSearchParams();
  const explicit = params.get("store");
  const active = explicit ?? "all";
  const restored = useRef(false);

  // Restore the last choice only on a bare /grocery visit, and only once per mount,
  // so it never fights a link the user actually followed.
  useEffect(() => {
    if (restored.current || explicit !== null) return;
    restored.current = true;

    const saved = readLastFilter();
    if (!saved || saved === "all") return;
    // A store that has since been deleted, or belongs to another family, simply
    // won't be in this list — fall back to All rather than filtering to nothing.
    if (saved !== "none" && !stores.some((s) => s.id === saved)) return;

    router.replace(`/grocery?store=${saved}`); // replace: don't trap the back button
  }, [explicit, stores, router]);

  function select(id: string) {
    try {
      window.localStorage.setItem(LAST_FILTER_KEY, id);
      // Picking a real store here is also "the last store used" for the add form.
      if (id !== "all" && id !== "none") window.localStorage.setItem(LAST_STORE_KEY, id);
    } catch {
      // not being able to remember is not a reason to fail the tap
    }
    const url = id === "all" ? "/grocery" : `/grocery?store=${id}`;
    router.push(url);
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => select("all")}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          active === "all"
            ? "bg-amber-600 text-white"
            : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
        }`}
      >
        All stores
      </button>
      <button
        onClick={() => select("none")}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          active === "none"
            ? "bg-amber-600 text-white"
            : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
        }`}
      >
        No store
      </button>
      {stores.map((s) => (
        <button
          key={s.id}
          onClick={() => select(s.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            active === s.id
              ? "bg-amber-600 text-white"
              : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
          }`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}
