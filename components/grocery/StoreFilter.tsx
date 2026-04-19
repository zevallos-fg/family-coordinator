"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Store {
  id: string;
  name: string;
}

interface StoreFilterProps {
  stores: Store[];
}

export function StoreFilter({ stores }: StoreFilterProps) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("store") ?? "all";

  function select(id: string) {
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
