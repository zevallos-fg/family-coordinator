"use client";

import { useCallback, useState } from "react";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/baby/time-input";

/**
 * The START TIME control, with "now" meaning the moment of the tap.
 *
 * The control is a datetime-local input, which has minute resolution. Sending
 * its value as the start of a timer truncated the seconds: a sleep started at
 * 22:48:49 was stored as 22:48:00, so the clock opened at 0:49. And because the
 * value was captured when the page loaded, a page left open for ten minutes
 * started its timer ten minutes in the past.
 *
 * So the value is only sent when someone actually changed it. Untouched, the
 * write omits p_at and the database stamps it with now() — to the second, at
 * the moment of the tap.
 */
export function useStartTime() {
  const [edited, setEdited] = useState<string | null>(null);

  const set = useCallback((value: string) => {
    // Picking the current minute (or tapping "now") is the same as not editing.
    setEdited(value === toLocalInputValue() ? null : value);
  }, []);

  const reset = useCallback(() => setEdited(null), []);

  /** ISO instant to send as p_at, or null to let the server use now(). */
  const instant = useCallback(
    () => (edited ? fromLocalInputValue(edited) : null),
    [edited]
  );

  return { value: edited ?? toLocalInputValue(), set, reset, instant };
}
