"use client";

import { useRef, useState } from "react";

interface Props {
  onSubmit: (formData: FormData) => Promise<void>;
  loading: boolean;
}

export function ReceiptUploadForm({ onSubmit, loading }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    await onSubmit(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Proper <label> wrapping makes the tap zone fully accessible:
          screen readers announce the label text, keyboard Tab navigates here,
          and mobile camera still triggers via capture="environment" on the input. */}
      <label
        htmlFor="receipt-file"
        className="block border-2 border-dashed border-amber-200 rounded-2xl p-8 text-center cursor-pointer hover:border-amber-400 transition-colors bg-amber-50"
      >
        {preview ? (
          <img
            src={preview}
            alt="Receipt preview"
            className="mx-auto max-h-64 rounded-xl object-contain"
          />
        ) : (
          <div className="space-y-3">
            <div className="text-5xl">🧾</div>
            <p className="text-amber-800 font-medium">Tap to upload or take a photo</p>
            <p className="text-amber-600 text-sm">JPEG, PNG, or WebP</p>
          </div>
        )}
        <input
          ref={fileRef}
          id="receipt-file"
          type="file"
          name="receipt"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
          required
        />
      </label>

      {preview && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="flex-1 py-2 px-4 rounded-xl border border-amber-200 text-amber-700 text-sm hover:bg-amber-50"
          >
            Change photo
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 px-4 rounded-xl bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50"
          >
            {loading ? "Parsing…" : "Parse receipt"}
          </button>
        </div>
      )}
    </form>
  );
}
