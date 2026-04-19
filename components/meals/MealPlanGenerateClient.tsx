"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generatePlanAction, replacePlanAction } from "@/app/(app)/meals/actions";

interface Props {
  weekOf: string;
  weekLabel: string;
  hasRecipes: boolean;
  existingPlanId: string | null;
  existingCreatedAt: string | null;
  compact?: boolean; // small outline "Replace plan" button for the plan-exists header row
}

export function MealPlanGenerateClient({
  weekOf,
  weekLabel,
  hasRecipes,
  existingPlanId: initialExistingPlanId,
  existingCreatedAt: initialExistingCreatedAt,
  compact = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState(initialExistingPlanId);
  const [pendingCreatedAt, setPendingCreatedAt] = useState(initialExistingCreatedAt);

  if (!hasRecipes) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500 text-sm mb-4">
          You need at least one recipe before generating a meal plan.
        </p>
        <a
          href="/meals/recipes/import"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Import your first recipe
        </a>
      </div>
    );
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const result = await generatePlanAction(weekOf);
      if (result.requiresConfirmation) {
        setPendingPlanId(result.existingPlanId ?? null);
        setPendingCreatedAt(result.existingCreatedAt ?? null);
        setShowConfirm(true);
        return;
      }
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleReplace() {
    if (!pendingPlanId) return;
    setLoading(true);
    setShowConfirm(false);
    try {
      const result = await replacePlanAction(pendingPlanId, weekOf);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const confirmDialog = showConfirm ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={() => setShowConfirm(false)}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900">Replace existing plan?</h3>
        <p className="text-sm text-gray-600">
          A plan already exists for the week of {weekLabel}
          {pendingCreatedAt
            ? ` (created ${new Date(pendingCreatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })})`
            : ""}
          . Replacing it will delete all current entries and generate a fresh plan.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleReplace}
            disabled={loading}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {loading ? "Replacing…" : "Replace"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={loading}
          className="text-xs text-gray-500"
        >
          {loading ? "Generating…" : "Replace plan"}
        </Button>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white text-base py-5 rounded-xl font-semibold shadow-sm transition-all"
      >
        {loading ? "Generating plan…" : `Generate plan for week of ${weekLabel}`}
      </Button>

      {loading && (
        <p className="text-xs text-orange-500 text-center mt-2">
          Claude is planning your week — takes 15–20 seconds.
        </p>
      )}

      {confirmDialog}
    </>
  );
}
