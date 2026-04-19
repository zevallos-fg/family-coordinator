"use client";

import { useState } from "react";
import { resolveCaptureAction, deleteCaptureAction } from "@/app/(app)/organized/actions";

interface Category {
  id: string;
  name: string;
  icon: string | null;
}

interface CaptureItemProps {
  id: string;
  text: string;
  created_at: string;
  voice_transcription: boolean;
  allCategories: Category[];
  onMove: (id: string, categoryId: string) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CaptureItem({
  id,
  text,
  created_at,
  voice_transcription,
  onMove,
}: CaptureItemProps) {
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleResolve() {
    setResolving(true);
    await resolveCaptureAction(id);
  }

  async function handleDelete() {
    setDeleting(true);
    await deleteCaptureAction(id);
  }

  return (
    <div className={`rounded-lg border border-stone-200 p-3 bg-white ${resolving || deleting ? "opacity-50" : ""}`}>
      <p className="text-sm text-stone-800 mb-2">{text}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {voice_transcription && (
            <span className="text-xs text-stone-400">🎤</span>
          )}
          <span className="text-xs text-stone-400">{timeAgo(created_at)}</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Done
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded bg-stone-50 text-stone-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
