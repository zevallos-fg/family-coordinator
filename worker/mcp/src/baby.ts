// Pure builders for baby-log rows written through the connector.
//
// These produce exactly the shapes the app writes (lib/baby/*), so a feed told
// to Claude and a feed tapped in the app are indistinguishable afterwards: same
// payload, same total (Left + Right), same editable sides. Kept dependency-free
// so the app's test suite can exercise them directly.

export type Side = "L" | "R";

export class BuildError extends Error {}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Minutes as typed by a person or a model: 10, 10.5, "10". Null when absent. */
export function minutesToSeconds(v: unknown, field: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 180) {
    throw new BuildError(`${field} must be minutes between 0 and 180`);
  }
  return Math.round(n * 60);
}

/**
 * A breast feed: sides laid end to end from the start, first side first, each
 * spell stamped with when it stopped. ended_at is when the last side stopped.
 */
export function breastFeed(
  startedAt: string,
  leftMinutes: unknown,
  rightMinutes: unknown,
  first: Side = "L"
): { payload: Record<string, unknown>; endedAt: string } {
  const seconds: Record<Side, number> = {
    L: minutesToSeconds(leftMinutes, "left_minutes") ?? 0,
    R: minutesToSeconds(rightMinutes, "right_minutes") ?? 0,
  };
  const order: Side[] = first === "R" ? ["R", "L"] : ["L", "R"];
  let at = Date.parse(startedAt);
  if (!Number.isFinite(at)) throw new BuildError("started_at is not a valid timestamp");
  const segments: Array<{ side: Side; seconds: number; ended: string }> = [];
  for (const side of order) {
    if (seconds[side] <= 0) continue;
    at += seconds[side] * 1000;
    segments.push({ side, seconds: seconds[side], ended: iso(at) });
  }
  if (segments.length === 0) {
    throw new BuildError("a breast feed needs left_minutes or right_minutes (or both)");
  }
  return {
    payload: { method: "breast", segments, running: null, last_side: segments[segments.length - 1].side },
    endedAt: iso(at),
  };
}

export const BOTTLE_UNITS = ["ml", "oz", "g"] as const;
const ML_PER_OZ = 29.5735;

/** A bottle: the amount as given, ml alongside for ml/oz, never invented for grams. */
export function bottleFeed(amount: unknown, unit: unknown, contents: unknown): Record<string, unknown> {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new BuildError("bottle_amount must be a positive number");
  if (!BOTTLE_UNITS.includes(unit as (typeof BOTTLE_UNITS)[number])) {
    throw new BuildError(`bottle_unit must be one of: ${BOTTLE_UNITS.join(", ")}`);
  }
  const u = unit as (typeof BOTTLE_UNITS)[number];
  const volume = u === "ml" ? n : u === "oz" ? Math.round(n * ML_PER_OZ * 10) / 10 : undefined;
  const c = typeof contents === "string" ? contents.trim() : "";
  return {
    method: "bottle",
    amount: n,
    unit: u,
    ...(volume !== undefined ? { volume_ml: volume } : {}),
    ...(c ? { contents: c } : {}),
  };
}

const SIZES: Record<string, string> = {
  small: "small", little: "small", medium: "medium", large: "large", big: "large",
};
export const DIAPER_CONTENTS = ["pee", "poo", "both", "dry"] as const;

/** A diaper, with only the details that apply to its contents. */
export function diaper(args: {
  contents: unknown;
  pee_size?: unknown;
  poo_size?: unknown;
  consistency?: unknown;
  rash?: unknown;
}): Record<string, unknown> {
  const raw = String(args.contents ?? "").toLowerCase();
  const contents = raw === "mixed" ? "both" : raw;
  if (!DIAPER_CONTENTS.includes(contents as (typeof DIAPER_CONTENTS)[number])) {
    throw new BuildError("contents must be one of: pee, poo, mixed (both), dry");
  }
  const size = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === "") return undefined;
    const s = SIZES[String(v).toLowerCase()];
    if (!s) throw new BuildError(`${field} must be little, medium or big`);
    return s;
  };
  const out: Record<string, unknown> = { contents };
  const hasPee = contents === "pee" || contents === "both";
  const hasPoo = contents === "poo" || contents === "both";
  const pee = size(args.pee_size, "pee_size");
  const poo = size(args.poo_size, "poo_size");
  if (pee && hasPee) out.pee_amount = pee;
  if (poo && hasPoo) out.poo_amount = poo;
  if (hasPoo && typeof args.consistency === "string" && args.consistency.trim()) {
    out.consistency = args.consistency.trim().toLowerCase();
  }
  if (args.rash === true) out.rash = "yes";
  return out;
}

const G_PER_OZ = 28.349523125;
const CM_PER_IN = 2.54;
const round = (n: number, p: number) => Math.round(n * 10 ** p) / 10 ** p;

/** Growth in US units as given, metric alongside — the app's exact shape. */
export function growth(args: {
  weight_lb?: unknown;
  weight_oz?: unknown;
  length_in?: unknown;
  head_in?: unknown;
}): Record<string, unknown> {
  const num = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) throw new BuildError(`${field} must be a positive number`);
    return n;
  };
  const lb = num(args.weight_lb, "weight_lb");
  const oz = num(args.weight_oz, "weight_oz");
  const len = num(args.length_in, "length_in");
  const head = num(args.head_in, "head_in");
  const out: Record<string, unknown> = {};
  if (lb !== null || oz !== null) {
    if ((oz ?? 0) >= 16) throw new BuildError("weight_oz must be under 16");
    const l = lb ?? 0;
    const o = oz ?? 0;
    if (l + o <= 0) throw new BuildError("weight must be more than zero");
    out.weight_lb = l;
    out.weight_oz = o;
    out.weight_kg = round(((l * 16 + o) * G_PER_OZ) / 1000, 3);
  }
  if (len !== null) {
    out.height_in = len;
    out.height_cm = round(len * CM_PER_IN, 1);
  }
  if (head !== null) {
    out.head_in = head;
    out.head_cm = round(head * CM_PER_IN, 1);
  }
  if (Object.keys(out).length === 0) throw new BuildError("give at least one of weight, length or head");
  return out;
}

/**
 * Evidence must carry its sources. A card with no citations is refused rather
 * than saved: an uncited answer stored as "evidence" is worse than none.
 */
export function citations(v: unknown): Array<{ title: string; url: string; pmid?: string }> {
  if (!Array.isArray(v) || v.length === 0) {
    throw new BuildError("citations are required: at least one {title, url}");
  }
  return v.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!title || !/^https:\/\//.test(url)) {
      throw new BuildError(`citation ${i + 1} needs a title and an https url`);
    }
    const pmid = typeof o.pmid === "string" || typeof o.pmid === "number" ? String(o.pmid) : undefined;
    return { title, url, ...(pmid ? { pmid } : {}) };
  });
}
