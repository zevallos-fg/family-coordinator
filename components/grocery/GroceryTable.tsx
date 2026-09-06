"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleInCart, updateGroceryStore } from "@/app/(app)/grocery/actions";
import { deleteWithUndo } from "@/lib/undo";

interface Store {
  id: string;
  name: string;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity: string | null;
  qty_value: number | null;
  qty_unit: string | null;
  in_cart: boolean;
  store_id: string | null;
  dedup_group_id: string | null;
  requires_review: boolean;
  stores: { name: string } | null;
}

type SortField = "name" | "store";
type SortDir = "asc" | "desc" | "none";

interface GroceryTableProps {
  items: GroceryItem[];
  stores: Store[];
}

function SortChevron({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field || sortDir === "none") return null;
  return sortDir === "asc" ? (
    <svg className="inline w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="inline w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function GroceryTable({ items, stores }: GroceryTableProps) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  // Removed on tap, before the network is touched. Undo takes ids back out.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Rows brought back by Undo that the server hasn't re-sent yet. Without this the
  // row would vanish for a round trip after the user asked for it back.
  const [resurrected, setResurrected] = useState<Map<string, GroceryItem>>(new Map());
  const [storeOverride, setStoreOverride] = useState<Record<string, string | null>>({});
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  function hide(ids: string[]) {
    setHidden((prev) => new Set([...prev, ...ids]));
    setResurrected((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function show(rows: GroceryItem[]) {
    setHidden((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.delete(r.id));
      return next;
    });
    setResurrected((prev) => {
      const next = new Map(prev);
      rows.forEach((r) => next.set(r.id, r));
      return next;
    });
  }

  if (items.length === 0 && resurrected.size === 0) {
    return (
      <div className="text-center py-10 text-stone-400">
        <p className="text-sm">Empty list</p>
      </div>
    );
  }

  function cycleSortField(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("asc");
      return;
    }
    setSortDir((prev) => (prev === "none" ? "asc" : prev === "asc" ? "desc" : "none"));
  }

  function sortedItems(source: GroceryItem[]): GroceryItem[] {
    if (sortDir === "none") return source;
    return [...source].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (sortField === "name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else {
        aVal = (a.stores?.name ?? "").toLowerCase();
        bVal = (b.stores?.name ?? "").toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  async function handleToggle(id: string, current: boolean) {
    setOptimistic((prev) => ({ ...prev, [id]: !current }));
    const res = await toggleInCart(id, current);
    if (res && !res.ok) {
      // Never leave the checkbox showing a state the database disagrees with.
      setOptimistic((prev) => ({ ...prev, [id]: current }));
      toast.error("Couldn't update that. Try again.");
    }
  }

  async function handleDelete(item: GroceryItem, isParent: boolean) {
    const group =
      isParent && item.dedup_group_id
        ? visible.filter((i) => i.dedup_group_id === item.dedup_group_id)
        : [item];
    const rows = group.length > 1 ? group : [item];

    hide(rows.map((r) => r.id));

    await deleteWithUndo({
      table: "grocery_items",
      ids: rows.map((r) => r.id),
      message: rows.length > 1 ? `${rows.length} items removed` : `${item.name} removed`,
      onShow: () => show(rows),
      onHide: () => hide(rows.map((r) => r.id)),
      onSettled: refresh,
    });
  }

  async function handleStoreChange(id: string, newStoreId: string) {
    setEditingStoreId(null);
    const previous = storeOverride[id];
    setStoreOverride((prev) => ({ ...prev, [id]: newStoreId || null }));
    const res = await updateGroceryStore(id, newStoreId || null);
    if (res && !res.ok) {
      setStoreOverride((prev) => {
        const next = { ...prev };
        if (previous === undefined) delete next[id];
        else next[id] = previous;
        return next;
      });
      toast.error("Couldn't change the store. Try again.");
      return;
    }
    refresh();
  }

  // What the user should see right now: the server's rows minus anything removed by
  // tap, plus anything Undo brought back that the server hasn't caught up on yet.
  const visible: GroceryItem[] = [
    ...items.filter((i) => !hidden.has(i.id)),
    ...[...resurrected.values()].filter((r) => !items.some((i) => i.id === r.id)),
  ];

  // Build cluster membership map over what is visible, so deleting a parent doesn't
  // leave its children indented under nothing.
  const clusterParents = new Set<string>();
  const clusterChildren = new Set<string>();
  const groupedItems = visible.filter((i) => i.dedup_group_id);
  const groupIds = [...new Set(groupedItems.map((i) => i.dedup_group_id!))];
  for (const gid of groupIds) {
    const members = visible.filter((i) => i.dedup_group_id === gid);
    if (members.length > 0) {
      clusterParents.add(members[0].id);
      members.slice(1).forEach((m) => clusterChildren.add(m.id));
    }
  }

  const sorted = sortedItems(visible);

  function storeLabel(item: GroceryItem): string {
    const overridden = storeOverride[item.id];
    if (overridden === undefined) return item.stores?.name ?? "—";
    if (overridden === null) return "—";
    return stores.find((s) => s.id === overridden)?.name ?? "—";
  }

  const headerCls = (field: SortField) =>
    `cursor-pointer select-none font-medium text-xs uppercase tracking-wide ${
      sortField === field && sortDir !== "none" ? "text-amber-700" : "text-stone-400"
    }`;

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[44px_1fr_120px_44px] px-3 py-2 border-b border-stone-100 bg-stone-50">
        <div />
        <button className={headerCls("name")} onClick={() => cycleSortField("name")}>
          Item <SortChevron field="name" sortField={sortField} sortDir={sortDir} />
        </button>
        <button className={headerCls("store")} onClick={() => cycleSortField("store")}>
          Store <SortChevron field="store" sortField={sortField} sortDir={sortDir} />
        </button>
        <div />
      </div>

      {/* Rows */}
      <div className="divide-y divide-stone-100">
        {sorted.map((item) => {
          const inCart = optimistic[item.id] ?? item.in_cart;
          const isChild = clusterChildren.has(item.id);
          const isParent = clusterParents.has(item.id);

          return (
            <div
              key={item.id}
              className={`grid grid-cols-[44px_1fr_auto_44px] sm:grid-cols-[44px_1fr_120px_44px] items-center transition-all ${
                inCart ? "opacity-50 bg-stone-50" : "bg-white hover:bg-stone-50/50"
              } ${isChild ? "pl-6" : ""}`}
            >
              {/* Checkbox */}
              <button
                onClick={() => handleToggle(item.id, item.in_cart)}
                aria-label={inCart ? "Mark as not purchased" : "Mark as purchased"}
                className="min-w-11 min-h-11 flex items-center justify-center"
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

              {/* Item */}
              <div className="py-2.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-sm text-stone-800 ${inCart ? "line-through" : ""} ${isChild ? "text-xs text-stone-600" : ""}`}>
                    {item.name}
                  </span>
                  {item.requires_review && (
                    <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded font-medium">
                      needs review
                    </span>
                  )}
                </div>
                {(item.qty_value !== null || item.quantity) && (
                  <p className="text-xs text-stone-400 mt-0.5">
                    {item.qty_value !== null
                      ? `${item.qty_value}${item.qty_unit ? " " + item.qty_unit : ""}`
                      : item.quantity}
                  </p>
                )}
              </div>

              {/* Store */}
              <div className="py-2.5 px-1">
                {editingStoreId === item.id ? (
                  <select
                    autoFocus
                    className="text-xs border border-stone-200 rounded px-1 py-0.5 text-stone-700 bg-white"
                    defaultValue={storeOverride[item.id] ?? item.store_id ?? ""}
                    onBlur={(e) => handleStoreChange(item.id, e.target.value)}
                    onChange={(e) => handleStoreChange(item.id, e.target.value)}
                  >
                    <option value="">No store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    className="text-xs text-stone-400 hover:text-stone-600 truncate max-w-[100px] text-left"
                    onClick={() => setEditingStoreId(item.id)}
                    title="Click to change store"
                  >
                    {storeLabel(item)}
                  </button>
                )}
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(item, isParent)}
                aria-label="Remove item"
                className="min-w-11 min-h-11 flex items-center justify-center text-stone-300 hover:text-rose-400 transition-colors"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
