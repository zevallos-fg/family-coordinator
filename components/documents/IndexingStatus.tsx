"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDocumentIndexingStatus,
  triggerIndexing,
} from "@/app/(app)/documents/actions";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

interface Props {
  documentId: string;
  indexedAt: string | null;
}

/**
 * "Indexing in progress…" with a way out of it.
 *
 * The detail page used to render that sentence from `indexed_at IS NULL` and
 * stop there — no polling, no timeout, no retry. A document whose indexing never
 * finished sat in that state permanently, and the only visible button on the page
 * was the nav's "More". The list view had a retry all along; this is the same
 * capability where someone actually lands after an upload.
 *
 * Ninety seconds is the give-up point, not the failure point: the work may still
 * be running server-side, so the copy says it has not finished rather than that
 * it broke.
 */
export function IndexingStatus({ documentId, indexedAt }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "stalled" | "retrying">(
    "waiting"
  );
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Array<ReturnType<typeof setInterval>>>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearInterval);
    timers.current = [];
  }, []);

  useEffect(() => {
    if (indexedAt || status !== "waiting") return;

    let cancelled = false;
    const startedAt = Date.now();

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        if (!cancelled) setStatus("stalled");
        return;
      }
      const result = await getDocumentIndexingStatus(documentId);
      if (cancelled || !result.ok) return;
      if (result.data.indexed_at) {
        clearInterval(interval);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    timers.current.push(interval);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [documentId, indexedAt, status, router, clearTimers]);

  if (indexedAt) {
    return (
      <p className="text-sm text-stone-700">
        {new Date(indexedAt).toLocaleDateString()}
      </p>
    );
  }

  async function retry() {
    setStatus("retrying");
    setError(null);
    const result = await triggerIndexing(documentId);
    if (!result.ok) {
      setError(result.error.userMessage);
      setStatus("stalled");
      return;
    }
    router.refresh();
    setStatus("waiting");
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-stone-700">
        {status === "retrying"
          ? "Indexing…"
          : status === "stalled"
            ? "Indexing hasn't finished"
            : "Indexing in progress…"}
      </p>

      {status === "stalled" && (
        <p className="text-xs text-stone-400">
          It may still be running, or it may have stopped. Retrying is safe.
        </p>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {status !== "retrying" && (
        <button
          type="button"
          onClick={retry}
          data-testid="retry-indexing"
          className="text-xs text-amber-700 underline underline-offset-2"
        >
          Retry indexing
        </button>
      )}
    </div>
  );
}
