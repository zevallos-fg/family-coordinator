import type { FeedPayload, NursingSegment, NursingSide } from "./nursing";

/**
 * Bottles, in the unit they were measured in.
 *
 * The amount is stored exactly as entered, with its unit, so "4 oz" reads back
 * as "4 oz" rather than as a converted "118.3 ml" nobody typed. `volume_ml` is
 * kept alongside for ml and oz because totals and the share view add volumes;
 * grams are a weight, and turning them into a volume would mean guessing a
 * density, so a gram bottle carries no volume_ml at all.
 */

export type BottleUnit = "ml" | "oz" | "g";
export const BOTTLE_UNITS: BottleUnit[] = ["ml", "oz", "g"];

/** US fluid ounce. */
export const ML_PER_OZ = 29.5735;

/** "120", "4.5", "4,5" -> a positive number; anything else -> null, never 0. */
export function parseAmount(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function bottlePayload(amount: number, unit: BottleUnit, contents: string): FeedPayload {
  const volume =
    unit === "ml" ? amount : unit === "oz" ? Math.round(amount * ML_PER_OZ * 10) / 10 : undefined;
  return {
    method: "bottle",
    amount,
    unit,
    ...(volume !== undefined ? { volume_ml: volume } : {}),
    ...(contents.trim() ? { contents: contents.trim() } : {}),
  };
}

/** "4 oz", "120 ml", "90 g" — as entered. Legacy rows with only volume_ml say ml. */
export function bottleAmountLabel(payload: FeedPayload): string | null {
  if (typeof payload.amount === "number" && payload.unit) return `${payload.amount} ${payload.unit}`;
  if (typeof payload.volume_ml === "number") return `${payload.volume_ml} ml`;
  return null;
}

export function isBottle(payload: FeedPayload | null | undefined): boolean {
  return (
    !!payload &&
    (payload.method === "bottle" ||
      typeof payload.volume_ml === "number" ||
      typeof payload.amount === "number")
  );
}

/**
 * A breast feed entered after the fact: Left and Right durations, and which side
 * came first. Spells are laid end to end from the start and stamped with their
 * stops, so the row behaves exactly like a timed feed — total is Left + Right,
 * Ended is when the last side stopped, and the sides stay editable.
 */
export function manualBreastFeed(
  startIso: string,
  seconds: Record<NursingSide, number>,
  first: NursingSide
): { payload: FeedPayload; endIso: string } | null {
  const order: NursingSide[] = first === "L" ? ["L", "R"] : ["R", "L"];
  let at = Date.parse(startIso);
  if (!Number.isFinite(at)) return null;
  const segments: NursingSegment[] = [];
  for (const side of order) {
    const s = seconds[side];
    if (!(s > 0)) continue;
    at += s * 1000;
    segments.push({ side, seconds: s, ended: new Date(at).toISOString() });
  }
  if (segments.length === 0) return null;
  return {
    payload: { method: "breast", segments, running: null, last_side: segments[segments.length - 1].side },
    endIso: new Date(at).toISOString(),
  };
}
