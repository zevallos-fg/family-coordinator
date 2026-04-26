"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { logVendorService } from "@/app/(app)/vendors/actions";

interface ServiceEntry {
  id: string;
  service_date: string;
  notes: string | null;
  cost_cents: number | null;
}

interface VendorServiceLogProps {
  vendorId: string;
  services: ServiceEntry[];
}

export function VendorServiceLog({ vendorId, services }: VendorServiceLogProps) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await logVendorService(vendorId, formData);

    setLoading(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    setShowForm(false);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-stone-700">Service History</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm text-amber-700 hover:underline"
        >
          {showForm ? "Cancel" : "+ Log service"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 border border-stone-200 rounded-lg space-y-3 bg-stone-50">
          {error && <ErrorBanner userMessage={error} />}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              name="service_date"
              type="date"
              required
              defaultValue={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Cost ($)</label>
            <input
              name="cost_cents"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 15000 for $150"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="What was done?"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Log Service"}
          </button>
        </form>
      )}

      {loading && !showForm && <LoadingState />}

      {services.length === 0 ? (
        <EmptyState
          title="No service history"
          description="Log your first service call to start tracking this vendor."
        />
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <div key={s.id} className="p-3 border border-stone-100 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-stone-700">
                  {new Date(s.service_date).toLocaleDateString()}
                </span>
                {s.cost_cents !== null && (
                  <span className="text-sm text-stone-500">
                    ${(s.cost_cents / 100).toFixed(2)}
                  </span>
                )}
              </div>
              {s.notes && <p className="text-xs text-stone-400">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
