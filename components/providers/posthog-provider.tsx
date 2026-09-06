"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // No key, no init. The `!` here used to hand posthog `undefined` in any
    // environment without analytics configured — which is now every CI run,
    // deliberately: a test suite must not write into real product analytics.
    if (typeof window !== "undefined" && POSTHOG_KEY) {
      posthog.init(POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        capture_pageview: "history_change",
        person_profiles: "identified_only",
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
