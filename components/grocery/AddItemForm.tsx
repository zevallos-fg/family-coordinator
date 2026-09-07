"use client";

import { useRef, useState, useTransition, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addGroceryItemFromText, previewDedup } from "@/app/(app)/grocery/actions";

interface Store {
  id: string;
  name: string;
}

interface AddItemFormProps {
  familyId: string;
  stores: Store[];
}

/**
 * The store you added to last. Shared with StoreFilter, which writes it whenever a real
 * store is picked, so "last store used" means one thing across the page. Concrete ids
 * only — "all" and "none" are filter states, not destinations.
 */
const LAST_STORE_KEY = "grocery:last-store";

// Read through useSyncExternalStore rather than an effect: localStorage is an external
// store, the server snapshot is null, and React handles the hydration step for us.
function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readLastStore(): string | null {
  try {
    return window.localStorage.getItem(LAST_STORE_KEY);
  } catch {
    return null; // private mode, storage disabled — just start on No store
  }
}
const noRememberedStore = () => null;

/**
 * The text input is UNCONTROLLED, for the same reason the caregiver recap textarea
 * is: a controlled input is unusable until the page hydrates, and anything typed
 * before then is silently discarded.
 *
 * The discarding is the part worth spelling out, because it does not recover on
 * its own. React seeds its input-value tracker from the DOM during hydration, so
 * once the DOM holds "watermelon" and `text` state holds "", re-typing the *same*
 * string fires no change event — there is no change. The word sits there, visibly
 * typed, with the Add button disabled forever, and the only way out is to edit it
 * to something else or reload. A phone on a slow connection hits this routinely;
 * it is why grocery-manual-add-merge failed on WebKit.
 *
 * So the DOM owns the text. React mirrors it for the merge preview and the button
 * label, and adopts whatever was typed before hydration on mount.
 */
export function AddItemForm({ familyId, stores }: AddItemFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  // undefined = the user hasn't picked this session, so fall back to what we remember.
  // null = they explicitly chose No store.
  const [chosenStoreId, setChosenStoreId] = useState<string | null | undefined>(undefined);

  const remembered = useSyncExternalStore(
    subscribeToStorage,
    readLastStore,
    noRememberedStore
  );

  const storeId =
    chosenStoreId !== undefined
      ? chosenStoreId
      : // a store that has since been deleted simply doesn't apply
        remembered && stores.some((s) => s.id === remembered)
        ? remembered
        : null;
  const [status, setStatus] = useState<"idle" | "parsing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    willMerge: boolean;
    existingItem?: { name: string; qty_value: number | null; qty_unit: string | null };
  } | null>(null);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt anything typed before hydration. Runs once, and only does something
  // when the DOM already holds text React never saw — which is exactly the case
  // that used to strand the Add button in its disabled state.
  useEffect(() => {
    const typedBeforeHydration = inputRef.current?.value ?? "";
    if (typedBeforeHydration) setText(typedBeforeHydration);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!text.trim()) {
        setMergePreview(null);
        return;
      }
      const result = await previewDedup(text.trim(), familyId);
      setMergePreview(result);
    }, 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, familyId]);

  async function submit() {
    // The DOM owns the text, so read it there rather than from the mirror.
    const current = (inputRef.current?.value ?? text).trim();
    if (!current) return;
    setStatus("parsing");
    setError(null);

    const fd = new FormData();
    fd.append("text", current);
    // A store named in the text ("at Costco") still wins on the server; this only fills
    // the gap when the text doesn't say.
    if (storeId) fd.append("defaultStoreId", storeId);

    const res = await addGroceryItemFromText(fd);
    setStatus("idle");
    setMergePreview(null);

    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }

    const action = res.action;
    const name = res.name ?? current;
    if (action === "merged") {
      toast.success(`Merged into ${name}`);
    } else if (action === "review_required") {
      toast.info(`Added ${name} — needs review (different unit)`);
    } else {
      toast.success(`Added ${name}`);
    }

    // Uncontrolled, so clearing state is not enough — clear the field itself.
    if (inputRef.current) inputRef.current.value = "";
    setText("");
    setStatus("done");
    startTransition(() => router.refresh());
    setTimeout(() => setStatus("idle"), 2000);
  }

  function selectStore(id: string | null) {
    setChosenStoreId(id);
    try {
      // Remember concrete stores only; "None" is a choice for this item, not a habit.
      if (id) window.localStorage.setItem(LAST_STORE_KEY, id);
    } catch {
      // not being able to remember is not a reason to fail the tap
    }
  }

  const willMerge = mergePreview?.willMerge ?? false;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex gap-2">
        <input
          type="text"
          ref={inputRef}
          defaultValue=""
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. 2 gallons of milk at Costco, bananas, eggs"
          className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          disabled={status === "parsing"}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || status === "parsing"}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {status === "parsing" ? "Parsing…" : willMerge ? "Add & merge" : "Add"}
        </button>
      </div>

      {willMerge && mergePreview?.existingItem && (
        <div className="mt-2 bg-teal-50 border border-teal-200 rounded-md px-3 py-1.5 text-sm text-teal-700">
          ✓ Will merge with existing {mergePreview.existingItem.name}
          {mergePreview.existingItem.qty_value !== null && (
            <span className="text-teal-600">
              {" "}({mergePreview.existingItem.qty_value}
              {mergePreview.existingItem.qty_unit ? " " + mergePreview.existingItem.qty_unit : ""})
            </span>
          )}
        </div>
      )}

      {stores.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="text-xs text-stone-400 whitespace-nowrap shrink-0">Store</span>
          {[{ id: "", name: "None" }, ...stores].map((s) => {
            const selected = (s.id || null) === storeId;
            return (
              <button
                key={s.id || "none"}
                type="button"
                onClick={() => selectStore(s.id || null)}
                aria-pressed={selected}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selected
                    ? "bg-amber-600 text-white"
                    : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      <p className="text-xs text-stone-400 mt-1.5">
        Claude parses quantities, units, and store preferences automatically.
      </p>
    </div>
  );
}
