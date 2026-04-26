"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { uploadDocument, queryDocuments, triggerIndexing, getDocumentIndexingStatus } from "@/app/(app)/documents/actions";
import type { DocumentMatch } from "@/skills/family-document-qa";

interface Document {
  id: string;
  title: string;
  doc_type: string | null;
  tags: string[] | null;
  file_url: string;
  indexed_at: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

interface DocumentVaultViewProps {
  docs: Document[];
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

export function DocumentVaultView({ docs: initialDocs }: DocumentVaultViewProps) {
  const [docs, setDocs] = useState(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentMatch[] | null>(null);
  const [noMatchReason, setNoMatchReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexingFailed, setIndexingFailed] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const stopPolling = useCallback((docId: string) => {
    const interval = pollTimers.current.get(docId);
    if (interval) { clearInterval(interval); pollTimers.current.delete(docId); }
    const timeout = pollTimeouts.current.get(docId);
    if (timeout) { clearTimeout(timeout); pollTimeouts.current.delete(docId); }
  }, []);

  const startPolling = useCallback((docId: string) => {
    stopPolling(docId);

    const interval = setInterval(async () => {
      const result = await getDocumentIndexingStatus(docId);
      if (!result.ok) return;
      if (result.data.indexed_at) {
        stopPolling(docId);
        const { indexed_at, tags } = result.data;
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, indexed_at: indexed_at!, tags: tags ?? d.tags }
              : d
          )
        );
      }
    }, POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      stopPolling(docId);
      setIndexingFailed((prev) => new Set([...prev, docId]));
    }, POLL_TIMEOUT_MS);

    pollTimers.current.set(docId, interval);
    pollTimeouts.current.set(docId, timeout);
  }, [stopPolling]);

  // Start polling for any unindexed docs on mount
  useEffect(() => {
    initialDocs.filter((d) => !d.indexed_at).forEach((d) => startPolling(d.id));
    return () => {
      pollTimers.current.forEach((_, id) => stopPolling(id));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const result = await uploadDocument(file);

    setUploading(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    // Add the new document optimistically and start polling for indexing
    const newDoc: Document = {
      id: result.data.id,
      title: file.name.replace(/\.[^/.]+$/, ""),
      doc_type: null,
      tags: null,
      file_url: "",
      indexed_at: null,
      file_size_bytes: file.size,
      created_at: new Date().toISOString(),
    };
    setDocs((prev) => [newDoc, ...prev]);
    startPolling(result.data.id);

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleRetryIndexing(docId: string) {
    setIndexingFailed((prev) => { const next = new Set(prev); next.delete(docId); return next; });
    const result = await triggerIndexing(docId);
    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }
    startPolling(docId);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchResults(null);
    setNoMatchReason(null);
    setError(null);

    const result = await queryDocuments(searchQuery);

    setSearching(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    setSearchResults(result.data.matches);
    setNoMatchReason(result.data.no_match_reason);
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {/* Search + Upload row */}
      <div className="flex gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents (e.g. 'health insurance deductible')"
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 bg-stone-700 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50"
          >
            Search
          </button>
        </form>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "+ Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.docx,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Search results */}
      {searching && <LoadingState text="Searching documents..." />}

      {searchResults !== null && !searching && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-stone-600">
            Search results for: &ldquo;{searchQuery}&rdquo;
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-sm text-stone-400">
              {noMatchReason ?? "No documents found matching your query."}
            </p>
          ) : (
            searchResults.map((match) => {
              const doc = docs.find((d) => d.id === match.document_id);
              return (
                <div key={match.document_id} className="p-3 border border-amber-200 rounded-lg bg-amber-50">
                  <div className="flex items-start justify-between mb-1">
                    <a
                      href={`/documents/${match.document_id}`}
                      className="text-sm font-medium text-amber-800 hover:underline"
                    >
                      {doc?.title ?? "Document"}
                    </a>
                    <span className="text-xs text-stone-400">
                      {Math.round(match.relevance_score * 100)}% match
                    </span>
                  </div>
                  <blockquote className="text-xs text-stone-600 border-l-2 border-amber-400 pl-2 mt-1">
                    {match.relevant_passage}
                  </blockquote>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Upload loading */}
      {uploading && <LoadingState text="Uploading and indexing..." />}

      {/* Document grid */}
      {docs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {docs.map((doc) => (
            <a
              key={doc.id}
              href={`/documents/${doc.id}`}
              className="p-3 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-start gap-2 mb-2">
                <svg className="w-8 h-8 text-stone-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-stone-800 truncate">{doc.title}</p>
                  <p className="text-xs text-stone-400">
                    {doc.doc_type ?? "document"}
                  </p>
                </div>
              </div>
              {indexingFailed.has(doc.id) ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    Indexing failed
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); handleRetryIndexing(doc.id); }}
                    className="text-xs text-amber-700 hover:underline font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : doc.indexed_at ? (
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  Indexed
                </span>
              ) : (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded animate-pulse">
                  Indexing…
                </span>
              )}
              {doc.tags && doc.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {doc.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
