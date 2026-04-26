"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { logMedicalEvent } from "@/app/(app)/kids/actions";

const MEDICAL_EVENT_TYPES = [
  "Well-child visit",
  "Sick visit",
  "Vaccination",
  "Dental checkup",
  "Eye exam",
  "Specialist visit",
  "ER visit",
  "Surgery",
  "Other",
];

interface MedicalEventFormProps {
  kidId: string;
}

export function MedicalEventForm({ kidId }: MedicalEventFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await logMedicalEvent(kidId, formData);

    setLoading(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    setShowForm(false);
    (e.target as HTMLFormElement).reset();
    window.location.reload();
  }

  return (
    <div>
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-stone-700 text-white rounded-lg text-sm font-medium hover:bg-stone-800"
        >
          + Log medical event
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 border border-stone-200 rounded-xl space-y-3 bg-stone-50">
          <h3 className="text-sm font-medium text-stone-700">New Medical Event</h3>
          {error && <ErrorBanner userMessage={error} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                name="event_date"
                type="date"
                required
                defaultValue={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                name="event_type"
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              >
                <option value="">Select type</option>
                {MEDICAL_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Provider</label>
            <input
              name="provider"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="Dr. Smith, Miami Children's..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="Vaccines given, measurements, follow-up instructions..."
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-stone-700 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Event"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-stone-300 rounded-lg text-sm text-stone-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
