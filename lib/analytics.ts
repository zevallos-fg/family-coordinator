import posthog from "posthog-js";

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    posthog.capture(event, properties);
  }
}
