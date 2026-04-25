"use client";

import { useState } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { createVendor, updateVendor } from "@/app/(app)/vendors/actions";

interface VendorFormProps {
  mode: "create" | "edit";
  vendorId?: string;
  defaultValues?: {
    name?: string;
    category?: string;
    phone?: string;
    email?: string;
    website?: string;
    notes?: string;
  };
  onSuccess?: (id: string) => void;
}

const CATEGORIES = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Landscaping",
  "Cleaning",
  "Pest Control",
  "Handyman",
  "Appliances",
  "Security",
  "Pool",
  "Other",
];

export function VendorForm({ mode, vendorId, defaultValues, onSuccess }: VendorFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const result =
      mode === "edit" && vendorId
        ? await updateVendor(vendorId, formData)
        : await createVendor(formData);

    setLoading(false);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    if (mode === "create" && result.ok) {
      onSuccess?.((result.data as { id: string }).id);
    }
  }

  if (loading) return <LoadingState text="Saving vendor..." />;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          defaultValue={defaultValues?.name}
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          placeholder="e.g. Cool Air Services"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Category</label>
        <select
          name="category"
          defaultValue={defaultValues?.category ?? ""}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">Select category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
          <input
            name="phone"
            defaultValue={defaultValues?.phone ?? ""}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="(305) 555-0100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="contact@vendor.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Website</label>
        <input
          name="website"
          defaultValue={defaultValues?.website ?? ""}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
        <textarea
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
          rows={3}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          placeholder="Any notes about this vendor..."
        />
      </div>

      <button
        type="submit"
        className="w-full py-2 px-4 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
      >
        {mode === "create" ? "Add Vendor" : "Save Changes"}
      </button>
    </form>
  );
}
