"use client";

import { useEffect } from "react";

/**
 * The boundary that was missing.
 *
 * Without an error.tsx, a Server Component that throws renders Next's default
 * 500 — which is why so much of this app preferred to swallow a failed read and
 * show an empty page instead. An empty page at least looked finished.
 *
 * With somewhere for a failure to land, code can stop pretending. This one sits
 * at the root so it also catches a throw from the (app) layout, which a boundary
 * inside that group could not.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-stone-800 mb-3">
        Something went wrong loading this
      </h1>
      <p className="text-stone-500 mb-8">
        Your data is fine — this page just couldn&apos;t reach it. Try again in a
        moment.
      </p>
      <button
        type="button"
        onClick={reset}
        data-testid="error-retry"
        className="inline-block bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 transition-colors"
      >
        Try again
      </button>
      {error.digest && (
        <p className="mt-8 text-xs text-stone-400">Reference: {error.digest}</p>
      )}
    </div>
  );
}
