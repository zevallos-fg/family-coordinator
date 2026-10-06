/**
 * Food and movement for a grown-up — built first for Yenny: breastfeeding,
 * recovering from a cesarean, living with rheumatoid arthritis.
 *
 * Every default target here comes from a page that was read on 2026-10-05.
 * They are the published lactation intakes for women 19–50, not a plan made
 * for her. Calories have no default: the sources disagree and her needs
 * depend on things the app can't see, so that goal is hers (or her OB's or a
 * dietitian's) to set.
 *
 * Pure: shared by the app and the Claude connector (worker/mcp).
 */

import type { Source } from "./rules";

export const NUTRITION_SOURCES = {
  dri: {
    title: "Dietary Reference Intakes: RDAs and AIs, macronutrients — National Academies (NCBI)",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK56068/table/summarytables.t4/",
  },
  dga2020: {
    title: "Dietary Guidelines for Americans 2020–2025 (pregnancy and lactation chapter)",
    url: "https://www.dietaryguidelines.gov/sites/default/files/2021-03/Dietary_Guidelines_for_Americans-2020-2025.pdf",
  },
  cdcDiet: {
    title: "Maternal Diet and Breastfeeding — CDC",
    url: "https://www.cdc.gov/breastfeeding-special-circumstances/hcp/diet-micronutrients/maternal-diet.html",
  },
  acogBreastfeeding: { title: "Breastfeeding Your Baby — ACOG", url: "https://www.acog.org/womens-health/faqs/breastfeeding-your-baby" },
  medlinePlus: { title: "Breastfeeding: diet and weight — MedlinePlus (NIH)", url: "https://medlineplus.gov/ency/patientinstructions/000586.htm" },
  acogExercise: { title: "Exercise After Pregnancy — ACOG", url: "https://www.acog.org/womens-health/faqs/exercise-after-pregnancy" },
  pag: {
    title: "Physical Activity Guidelines for Americans, 2nd edition — HHS",
    url: "https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf",
  },
  acrIntegrative: {
    title: "2022 ACR Guideline for Exercise, Rehabilitation, Diet and Integrative Interventions for RA",
    url: "https://stacks.cdc.gov/view/cdc/151745/cdc_151745_DS1.pdf",
  },
  cdcArthritis: { title: "Physical Activity for Arthritis — CDC", url: "https://www.cdc.gov/arthritis/prevention/index.html" },
  odsOmega3: { title: "Omega-3 Fatty Acids — NIH Office of Dietary Supplements", url: "https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/" },
} satisfies Record<string, Source>;

const ods = (name: string, title: string): Source => ({
  title: `${title} — NIH Office of Dietary Supplements`,
  url: `https://ods.od.nih.gov/factsheets/${name}-HealthProfessional/`,
});

export type NutrientKey =
  | "kcal"
  | "protein_g"
  | "fiber_g"
  | "calcium_mg"
  | "iron_mg"
  | "vitamin_d_mcg"
  | "iodine_mcg"
  | "choline_mg"
  | "folate_mcg"
  | "b12_mcg"
  | "zinc_mg"
  | "vitamin_c_mg"
  | "magnesium_mg"
  | "vitamin_a_mcg"
  | "potassium_mg";

export type Nutrient = {
  key: NutrientKey;
  label: string;
  unit: string;
  /** Published intake while breastfeeding, women 19–50; null = no default. */
  lactation: number | null;
  basis?: "RDA" | "AI";
  note?: string;
  source: Source;
  /** Ceiling for one entry — a typo guard, not a safety limit. */
  max: number;
};

export const NUTRIENTS: Nutrient[] = [
  { key: "kcal", label: "Calories", unit: "kcal", lactation: null, source: NUTRITION_SOURCES.dga2020, max: 5000 },
  { key: "protein_g", label: "Protein", unit: "g", lactation: 71, basis: "RDA", source: NUTRITION_SOURCES.dri, max: 300 },
  { key: "fiber_g", label: "Fiber", unit: "g", lactation: 29, basis: "AI", source: NUTRITION_SOURCES.dri, max: 150 },
  { key: "calcium_mg", label: "Calcium", unit: "mg", lactation: 1000, basis: "RDA", source: ods("Calcium", "Calcium"), max: 10000 },
  { key: "iron_mg", label: "Iron", unit: "mg", lactation: 9, basis: "RDA", note: "Lower than before pregnancy while breastfeeding.", source: ods("Iron", "Iron"), max: 500 },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "mcg", lactation: 15, basis: "RDA", note: "15 mcg is 600 IU.", source: ods("VitaminD", "Vitamin D"), max: 2500 },
  { key: "iodine_mcg", label: "Iodine", unit: "mcg", lactation: 290, basis: "RDA", note: "Higher while breastfeeding (CDC).", source: ods("Iodine", "Iodine"), max: 10000 },
  { key: "choline_mg", label: "Choline", unit: "mg", lactation: 550, basis: "AI", note: "Higher while breastfeeding (CDC).", source: ods("Choline", "Choline"), max: 10000 },
  { key: "folate_mcg", label: "Folate", unit: "mcg DFE", lactation: 500, basis: "RDA", source: ods("Folate", "Folate"), max: 10000 },
  { key: "b12_mcg", label: "Vitamin B12", unit: "mcg", lactation: 2.8, basis: "RDA", source: ods("VitaminB12", "Vitamin B12"), max: 5000 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", lactation: 12, basis: "RDA", source: ods("Zinc", "Zinc"), max: 500 },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", lactation: 120, basis: "RDA", source: ods("VitaminC", "Vitamin C"), max: 10000 },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", lactation: 310, basis: "RDA", note: "310 mg at 19–30; 320 mg at 31–50.", source: ods("Magnesium", "Magnesium"), max: 5000 },
  { key: "vitamin_a_mcg", label: "Vitamin A", unit: "mcg RAE", lactation: 1300, basis: "RDA", source: ods("VitaminA", "Vitamin A"), max: 30000 },
  { key: "potassium_mg", label: "Potassium", unit: "mg", lactation: 2800, basis: "AI", source: ods("Potassium", "Potassium"), max: 20000 },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);
export const MAIN_KEYS: NutrientKey[] = ["protein_g", "fiber_g", "kcal"];
export const MICRO_KEYS = NUTRIENT_KEYS.filter((k) => !MAIN_KEYS.includes(k));
const BY_KEY = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n])) as Record<NutrientKey, Nutrient>;
export const nutrient = (k: NutrientKey) => BY_KEY[k];

export type Nutrients = Partial<Record<NutrientKey, number>>;

export class NutritionError extends Error {}

/**
 * Keep known nutrients with sensible numbers. Unknown keys are dropped;
 * negative, non-numeric or absurd values are refused rather than stored.
 */
export function cleanNutrients(raw: unknown): Nutrients {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new NutritionError("nutrients must be an object");
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in BY_KEY) || v === null || v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    const spec = BY_KEY[k as NutrientKey];
    if (!Number.isFinite(n) || n < 0) throw new NutritionError(`${spec.label} must be a number of ${spec.unit}, 0 or more`);
    if (n > spec.max) throw new NutritionError(`${spec.label} ${n} ${spec.unit} looks like a typo (one entry over ${spec.max})`);
    out[k as NutrientKey] = Math.round(n * 10) / 10;
  }
  return out;
}

// ── Food entries ─────────────────────────────────────────────────────────────

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

/** The usual meal for a local hour — just a default the person can change. */
export function mealFor(hour: number): Meal {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21) return "dinner";
  return "snack";
}

export type FoodPayload = {
  name: string;
  meal?: Meal;
  servings?: number;
  /** Totals for what was eaten (already times servings). */
  nutrients: Nutrients;
  /** True when the numbers are a guess (Claude's estimate, or eyeballed). */
  estimated?: boolean;
  source?: "manual" | "label" | "repeat" | "claude_estimate";
  /** Ounces of fish or shellfish, for the weekly seafood guidance. */
  seafood_oz?: number;
};

export function foodPayload(input: {
  name: unknown;
  meal?: unknown;
  servings?: unknown;
  nutrients?: unknown;
  estimated?: unknown;
  source?: FoodPayload["source"];
  seafood_oz?: unknown;
}): FoodPayload {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new NutritionError("name is required — what was eaten");
  if (name.length > 200) throw new NutritionError("name is too long");
  const meal = input.meal === undefined || input.meal === null || input.meal === "" ? undefined : String(input.meal);
  if (meal !== undefined && !(MEALS as readonly string[]).includes(meal)) throw new NutritionError(`meal must be one of: ${MEALS.join(", ")}`);
  const servings = input.servings === undefined || input.servings === null || input.servings === "" ? undefined : Number(input.servings);
  if (servings !== undefined && (!Number.isFinite(servings) || servings <= 0 || servings > 20)) throw new NutritionError("servings must be between 0 and 20");
  const seafood = input.seafood_oz === undefined || input.seafood_oz === null || input.seafood_oz === "" ? undefined : Number(input.seafood_oz);
  if (seafood !== undefined && (!Number.isFinite(seafood) || seafood < 0 || seafood > 48)) throw new NutritionError("seafood_oz must be between 0 and 48");
  const out: FoodPayload = { name, nutrients: cleanNutrients(input.nutrients) };
  if (meal) out.meal = meal as Meal;
  if (servings !== undefined) out.servings = servings;
  if (input.estimated === true) out.estimated = true;
  if (input.source) out.source = input.source;
  if (seafood) out.seafood_oz = seafood;
  return out;
}

export type FoodRow = { at: string; payload: FoodPayload };

export type DayTotals = {
  entries: number;
  estimated: number;
  totals: Nutrients;
  /** How many entries carried each nutrient — a total from 1 of 5 foods is not a day's intake. */
  coverage: Partial<Record<NutrientKey, number>>;
};

export function dayTotals(rows: FoodRow[]): DayTotals {
  const totals: Nutrients = {};
  const coverage: Partial<Record<NutrientKey, number>> = {};
  let estimated = 0;
  for (const r of rows) {
    if (r.payload?.estimated) estimated++;
    for (const [k, v] of Object.entries(r.payload?.nutrients ?? {})) {
      const key = k as NutrientKey;
      if (!(key in BY_KEY) || typeof v !== "number" || !Number.isFinite(v)) continue;
      totals[key] = Math.round(((totals[key] ?? 0) + v) * 10) / 10;
      coverage[key] = (coverage[key] ?? 0) + 1;
    }
  }
  return { entries: rows.length, estimated, totals, coverage };
}

// ── Targets ──────────────────────────────────────────────────────────────────

export type Target = { value: number; from: "lactation" | "goal" };
export type Goals = { kcal?: number | null; overrides?: Nutrients | null };

/**
 * Lactation defaults when breastfeeding, with the person's own goals on top.
 * Not breastfeeding → only the goals she set; the app shows totals without
 * inventing a target.
 */
export function targetsFor(lactating: boolean, goals: Goals = {}): Partial<Record<NutrientKey, Target>> {
  const out: Partial<Record<NutrientKey, Target>> = {};
  if (lactating) for (const n of NUTRIENTS) if (n.lactation !== null) out[n.key] = { value: n.lactation, from: "lactation" };
  for (const [k, v] of Object.entries(goals.overrides ?? {})) {
    if (k in BY_KEY && typeof v === "number" && v > 0) out[k as NutrientKey] = { value: v, from: "goal" };
  }
  if (goals.kcal && goals.kcal > 0) out.kcal = { value: goals.kcal, from: "goal" };
  return out;
}

export type ProgressRow = {
  key: NutrientKey;
  label: string;
  unit: string;
  value: number | null;
  target: Target | null;
  /** 0–1+, null without a target. */
  share: number | null;
  /** Entries that carried this nutrient, of all entries today. */
  covered: number;
  entries: number;
};

export function progress(day: DayTotals, targets: Partial<Record<NutrientKey, Target>>, keys: NutrientKey[] = NUTRIENT_KEYS): ProgressRow[] {
  return keys.map((key) => {
    const n = BY_KEY[key];
    const value = day.totals[key] ?? null;
    const target = targets[key] ?? null;
    return {
      key,
      label: n.label,
      unit: n.unit,
      value,
      target,
      share: target ? (value ?? 0) / target.value : null,
      covered: day.coverage[key] ?? 0,
      entries: day.entries,
    };
  });
}

/** Foods worth one tap again: most-logged first, then most recent. */
export function recentFoods(rows: FoodRow[], limit = 8): FoodPayload[] {
  const seen = new Map<string, { food: FoodPayload; count: number; last: number }>();
  for (const r of rows) {
    if (!r.payload?.name) continue;
    const key = r.payload.name.trim().toLowerCase();
    const at = Date.parse(r.at);
    const hit = seen.get(key);
    if (!hit) seen.set(key, { food: r.payload, count: 1, last: at });
    else {
      hit.count++;
      if (at > hit.last) {
        hit.last = at;
        hit.food = r.payload;
      }
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map((s) => s.food);
}

// ── Calories, seafood, weight: what the sources say ──────────────────────────

export const CALORIE_GUIDANCE: Array<{ text: string; source: Source }> = [
  {
    text: "About 330 extra calories a day in the first 6 months of breastfeeding, and 400 in the next 6, compared with before pregnancy. That figure already subtracts 170 a day for expected weight loss after birth.",
    source: NUTRITION_SOURCES.dga2020,
  },
  { text: "330 to 400 extra calories a day for well-nourished breastfeeding mothers.", source: NUTRITION_SOURCES.cdcDiet },
  {
    text: "About 450 to 500 extra calories a day to make milk — the full cost, before counting weight loss. Higher than the federal figure for that reason.",
    source: NUTRITION_SOURCES.acogBreastfeeding,
  },
  {
    text: "No crash or fad diets. Wait for the 6-week checkup before trying to slim down, and until the baby is at least 2 months old before cutting calories hard. About 1½ lb a week shouldn't affect milk supply.",
    source: NUTRITION_SOURCES.medlinePlus,
  },
];

export const SEAFOOD = {
  minOz: 8,
  maxOz: 12,
  text: "At least 8 and up to 12 ounces of seafood a week while breastfeeding, from choices lower in mercury — salmon, sardines, anchovies, trout, Pacific oysters are high in DHA. Skip shark, swordfish, king mackerel, marlin, orange roughy, bigeye tuna and tilefish; keep albacore tuna to 6 oz a week.",
  sources: [NUTRITION_SOURCES.dga2020, NUTRITION_SOURCES.acogBreastfeeding],
};

export const SUPPLEMENT_NOTE = {
  text: "Breastfeeding raises iodine and choline needs, and some mothers need a supplement or multivitamin to meet them (CDC). The RA guideline separately advises against adding supplements to treat RA itself (ACR, conditional). These are about different things — ask her OB and rheumatologist together what she should take.",
  sources: [NUTRITION_SOURCES.cdcDiet, NUTRITION_SOURCES.acrIntegrative],
};

// ── Movement ─────────────────────────────────────────────────────────────────

export const ACTIVITIES = [
  { value: "walk", label: "Walk" },
  { value: "stretch", label: "Stretch" },
  { value: "pelvic_floor", label: "Pelvic floor" },
  { value: "strength", label: "Strength" },
  { value: "pt", label: "PT" },
  { value: "yoga", label: "Yoga" },
  { value: "swim", label: "Swim" },
  { value: "bike", label: "Bike" },
  { value: "other", label: "Other" },
] as const;
export type Activity = (typeof ACTIVITIES)[number]["value"];
const ACTIVITY_VALUES = ACTIVITIES.map((a) => a.value) as string[];

export type MovePayload = {
  activity: Activity;
  minutes: number;
  steps?: number;
  /** Where it came from — wearables will write 'oura' or 'whoop' here. */
  source?: "manual" | "oura" | "whoop" | "claude_chat";
  note?: string;
};

export function movePayload(input: { activity: unknown; minutes: unknown; steps?: unknown; note?: unknown; source?: MovePayload["source"] }): MovePayload {
  const activity = String(input.activity ?? "");
  if (!ACTIVITY_VALUES.includes(activity)) throw new NutritionError(`activity must be one of: ${ACTIVITY_VALUES.join(", ")}`);
  const minutes = Number(input.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) throw new NutritionError("minutes must be between 1 and 600");
  const out: MovePayload = { activity: activity as Activity, minutes: Math.round(minutes) };
  if (input.steps !== undefined && input.steps !== null && input.steps !== "") {
    const steps = Number(input.steps);
    if (!Number.isInteger(steps) || steps < 0 || steps > 100000) throw new NutritionError("steps must be a whole number");
    out.steps = steps;
  }
  if (typeof input.note === "string" && input.note.trim()) out.note = input.note.trim().slice(0, 500);
  if (input.source) out.source = input.source;
  return out;
}

export const WEEKLY_MINUTES = 150;

export type MoveRow = { at: string; payload: MovePayload };

/** Minutes in the 7 days ending now (rolling, so a week never "resets" to zero). */
export function minutesSince(rows: MoveRow[], sinceMs: number, untilMs = Infinity): number {
  return rows
    .filter((r) => {
      const t = Date.parse(r.at);
      return t >= sinceMs && t < untilMs;
    })
    .reduce((s, r) => s + (Number(r.payload?.minutes) || 0), 0);
}

export type ExerciseGate = { gated: boolean; text: string; source: Source };

/**
 * ACOG: after a cesarean or complications, "ask your ob-gyn when it is safe to
 * begin exercising again." Until she marks that she's been cleared, the app
 * logs movement but sets no weekly goal.
 */
export function exerciseGate(profile: { delivery_type?: string | null; exercise_cleared_on?: string | null } | null): ExerciseGate {
  if (profile?.delivery_type === "cesarean" && !profile.exercise_cleared_on) {
    return {
      gated: true,
      text: "After a C-section, ask the OB when it's safe to start exercising again. Until then this keeps a log without a weekly goal.",
      source: NUTRITION_SOURCES.acogExercise,
    };
  }
  return {
    gated: false,
    text: "At least 150 minutes of moderate activity a week — 30 minutes on 5 days, or three 10-minute walks a day. Even 10 minutes helps. Stop if you feel pain.",
    source: NUTRITION_SOURCES.acogExercise,
  };
}

export const BREASTFEEDING_EXERCISE = {
  text: "Feed or pump before a workout, wear a supportive bra, and keep water close.",
  source: NUTRITION_SOURCES.acogExercise,
};

export const RA_GUIDANCE: Array<{ text: string; strength: string; source: Source }> = [
  { text: "Regular exercise, over none.", strength: "Strong recommendation", source: NUTRITION_SOURCES.acrIntegrative },
  {
    text: "A Mediterranean-style diet — vegetables, fruit, whole grains, beans, fish, olive oil, nuts — over no particular diet. Other formal diets are advised against.",
    strength: "Conditional recommendation",
    source: NUTRITION_SOURCES.acrIntegrative,
  },
  {
    text: "Activity eases arthritis pain and improves function and mood. Start slowly and pay attention to how your body feels; walking, cycling, swimming and tai chi are joint-friendly.",
    strength: "CDC",
    source: NUTRITION_SOURCES.cdcArthritis,
  },
];

// ── Local days ───────────────────────────────────────────────────────────────

function tzOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(ms / 1000) * 1000;
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** [start, end) of a local calendar day as epoch ms, DST-safe. */
export function localDayBounds(date: string, timeZone: string): [number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new NutritionError(`date must be YYYY-MM-DD (got "${date}")`);
  const midnight = (y: number, mo: number, d: number) => {
    const guess = Date.UTC(y, mo - 1, d);
    const first = guess - tzOffsetMs(guess, timeZone);
    return guess - tzOffsetMs(first, timeZone);
  };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return [midnight(y, mo, d), midnight(y, mo, d + 1)];
}
