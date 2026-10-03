/**
 * Growth in US units: weight in lb + oz, length and head in inches.
 *
 * Stored as entered (weight_lb, weight_oz, height_in, head_in) so "8 lb 9 oz"
 * reads back exactly, never as a rounded conversion. The metric values
 * (weight_kg, height_cm, head_cm) are written alongside, because that is what
 * a pediatric chart or a clinician's record uses. Rows saved before this change
 * have metric only and are shown converted.
 */

export const G_PER_OZ = 28.349523125;
export const OZ_PER_LB = 16;
export const CM_PER_IN = 2.54;

export interface GrowthPayload {
  weight_lb?: number;
  weight_oz?: number;
  weight_kg?: number;
  height_in?: number;
  height_cm?: number;
  head_in?: number;
  head_cm?: number;
}

/** "" -> null (not entered); "8", "8.5", "8,5" -> number; junk or negative -> NaN. */
export function parseMeasure(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (text === "") return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * Build the payload from the form. Returns an error string for anything that
 * cannot be a real measurement, so a typo is refused rather than saved.
 */
export function growthPayload(fields: {
  lb: string;
  oz: string;
  height: string;
  head: string;
}): { payload: GrowthPayload } | { error: string } {
  const lb = parseMeasure(fields.lb);
  const oz = parseMeasure(fields.oz);
  const height = parseMeasure(fields.height);
  const head = parseMeasure(fields.head);
  const payload: GrowthPayload = {};

  if (lb !== null || oz !== null) {
    const l = lb ?? 0;
    const o = oz ?? 0;
    if (Number.isNaN(l) || Number.isNaN(o) || o >= OZ_PER_LB || l + o <= 0) {
      return { error: "Weight doesn't look right. Ounces go up to 15.9." };
    }
    payload.weight_lb = l;
    payload.weight_oz = o;
    payload.weight_kg = round(((l * OZ_PER_LB + o) * G_PER_OZ) / 1000, 3);
  }
  if (height !== null) {
    if (Number.isNaN(height) || height <= 0) return { error: "Length doesn't look right." };
    payload.height_in = height;
    payload.height_cm = round(height * CM_PER_IN, 1);
  }
  if (head !== null) {
    if (Number.isNaN(head) || head <= 0) return { error: "Head doesn't look right." };
    payload.head_in = head;
    payload.head_cm = round(head * CM_PER_IN, 1);
  }
  if (Object.keys(payload).length === 0) return { error: "Enter at least one measurement." };
  return { payload };
}

function num(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "8 lb 9 oz" — as entered when available, else converted from kg. */
export function weightLabel(p: Record<string, unknown>): string | null {
  const lb = num(p, "weight_lb");
  const oz = num(p, "weight_oz");
  if (lb !== null || oz !== null) return `${lb ?? 0} lb ${oz ?? 0} oz`;
  const kg = num(p, "weight_kg");
  if (kg === null) return null;
  const totalOz = (kg * 1000) / G_PER_OZ;
  let wholeLb = Math.floor(totalOz / OZ_PER_LB);
  let restOz = round(totalOz - wholeLb * OZ_PER_LB, 1);
  if (restOz >= OZ_PER_LB) {
    wholeLb += 1;
    restOz = 0;
  }
  return `${wholeLb} lb ${restOz} oz`;
}

function inches(p: Record<string, unknown>, inKey: string, cmKey: string): string | null {
  const i = num(p, inKey);
  if (i !== null) return `${i} in`;
  const cm = num(p, cmKey);
  return cm === null ? null : `${round(cm / CM_PER_IN, 1)} in`;
}

/** "8 lb 9 oz · 20.5 in · head 13.8 in" */
export function growthSummary(payload: Record<string, unknown>): string | null {
  const bits = [weightLabel(payload), inches(payload, "height_in", "height_cm")];
  const head = inches(payload, "head_in", "head_cm");
  if (head) bits.push(`head ${head}`);
  const parts = bits.filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}
