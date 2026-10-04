import { visibleChipGroups } from "./events";

/**
 * The diaper row to write, from what is selected on screen.
 *
 * Only answers that still apply to the chosen contents are kept: pick Poo, set
 * a poo size, then change your mind to Pee, and the poo size is dropped rather
 * than saved onto a wet-only change.
 */
export function diaperPayload(
  contents: string,
  details: Record<string, string | null | undefined>,
  potty: boolean
): Record<string, string | boolean> {
  const applicable = new Set(visibleChipGroups("diaper", { contents }).map((g) => g.key));
  const payload: Record<string, string | boolean> = { contents };
  if (potty) payload.potty = true;
  for (const [key, value] of Object.entries(details)) {
    if (value && key !== "contents" && applicable.has(key)) payload[key] = value;
  }
  return payload;
}
