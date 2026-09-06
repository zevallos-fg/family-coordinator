"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { LoadingState } from "@/components/ui/LoadingState";
import { generateChecklist, markItemDone, markItemNA } from "@/app/(app)/hurricane/actions";
import { isChecklistSettled, type ChecklistStatus } from "@/lib/db/enums";

interface ChecklistItem {
  id: string;
  item_text: string;
  status: string;
  due_by_date: string | null;
}

interface HurricaneChecklistProps {
  items: ChecklistItem[];
  showGenerateButton: boolean;
}

function parsePriorityCategory(text: string): { priority: string; category: string; label: string } {
  // Format: [PRIORITY][Category] label text
  const match = text.match(/^\[([A-Z]+)\]\[([^\]]+)\]\s*(.+)$/);
  if (match) {
    return { priority: match[1].toLowerCase(), category: match[2], label: match[3] };
  }
  return { priority: "medium", category: "General", label: text };
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-stone-100 text-stone-600 border-stone-200",
};

function groupByCategory(items: ChecklistItem[]): Record<string, ChecklistItem[]> {
  const groups: Record<string, ChecklistItem[]> = {};
  for (const item of items) {
    const { category } = parsePriorityCategory(item.item_text);
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
  }
  return groups;
}

export function HurricaneChecklist({ items: initialItems, showGenerateButton }: HurricaneChecklistProps) {
  const [items, setItems] = useState(initialItems);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const result = await generateChecklist();
    setGenerating(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    window.location.reload();
  }

  async function handleDone(id: string) {
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, status: "done" satisfies ChecklistStatus } : item)
    );
    const result = await markItemDone(id);
    if (!result.ok) setError(result.error.userMessage);
  }

  async function handleNA(id: string) {
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, status: "na" satisfies ChecklistStatus } : item)
    );
    const result = await markItemNA(id);
    if (!result.ok) setError(result.error.userMessage);
  }

  if (generating) return <LoadingState text="Generating your hurricane prep checklist..." />;

  const groups = groupByCategory(items);

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {showGenerateButton && (
        <button
          onClick={handleGenerate}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          Generate 2026 Checklist
        </button>
      )}

      {Object.entries(groups).map(([category, categoryItems]) => (
        <div key={category} className="space-y-2">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
            {category}
          </h3>
          {categoryItems.map((item) => {
            const { priority, label } = parsePriorityCategory(item.item_text);
            const isDone = isChecklistSettled(item.status);
            const colorClass = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium;

            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
                  isDone ? "border-stone-100 bg-stone-50 opacity-60" : "border-stone-200 bg-white"
                }`}
              >
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${colorClass}`}
                >
                  {priority}
                </span>
                <div className="flex-1">
                  <span
                    className={`text-sm ${isDone ? "line-through text-stone-400" : "text-stone-700"}`}
                  >
                    {label}
                  </span>
                  {item.due_by_date && (
                    <p className="text-xs text-stone-400 mt-0.5">
                      Due: {new Date(item.due_by_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {!isDone && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleDone(item.id)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => handleNA(item.id)}
                      className="text-xs text-stone-400 hover:underline"
                    >
                      N/A
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
