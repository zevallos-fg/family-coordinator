"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The same failure, rendered inside the app shell so the nav stays put and the
 * rest of the app is one tap away. Pages under (app) land here; a throw from the
 * (app) layout itself falls through to app/error.tsx.
 */
export default function AppError({
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
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          data-testid="error-retry"
          className="bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/now"
          className="px-6 py-3 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors"
        >
          Go to Now
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-xs text-stone-400">Reference: {error.digest}</p>
      )}
    </div>
  );
}
