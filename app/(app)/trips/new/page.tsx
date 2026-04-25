"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { createTrip } from "@/app/(app)/trips/actions";

export default function NewTripPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createTrip(formData);

    setLoading(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    router.push(`/trips/${result.data.id}`);
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <a href="/trips" className="text-sm text-stone-400 hover:text-stone-600">
          ← Trips
        </a>
        <h1 className="text-xl font-bold text-stone-800 mt-2">Plan a Trip</h1>
        <p className="text-sm text-stone-400 mt-1">
          AI will generate a packing list and prep tasks after you save.
        </p>
      </div>

      {loading ? (
        <LoadingState text="Planning trip and generating packing list..." />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Destination <span className="text-red-500">*</span>
            </label>
            <input
              name="destination"
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="e.g. Miami Beach, FL"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                name="start_date"
                type="date"
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                name="end_date"
                type="date"
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={3}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="e.g. beach vacation, business conference, ski trip..."
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            Plan Trip + Generate Packing List
          </button>
        </form>
      )}
    </main>
  );
}
