/**
 * Expert practice — Dr. Gabrielle Lyon and Dr. Stacy Sims — kept apart from
 * the published intakes in nutrition.ts.
 *
 * Every quote below was read on the cited page on 2026-10-05. Neither expert
 * has published guidance for breastfeeding, the weeks after a cesarean, or
 * rheumatoid arthritis; their numbers are written for adults or active women
 * in general. So the app shows them as options she can choose (a protein
 * goal, 30 g a meal, how to build training back) and says plainly where they
 * don't reach, instead of mixing them into the defaults.
 *
 * Pure: shared by the app and the Claude connector.
 */

import type { Source } from "./rules";
import { NUTRITION_SOURCES } from "./nutrition";

export const EXPERT_SOURCES = {
  lyonHuberman: {
    title: "Dr. Gabrielle Lyon on Huberman Lab — How to Exercise & Eat for Optimal Health & Longevity (transcript)",
    url: "https://www.hubermanlab.com/episode/dr-gabrielle-lyon-how-to-exercise-eat-for-optimal-health-longevity",
  },
  lyonProtocol: {
    title: "The Lyon Protocol — Dr. Gabrielle Lyon",
    url: "https://drgabriellelyon.com/wp-content/uploads/2024/01/The-Lyon-Protocol-Dr.-Gabrielle-Lyon.pdf",
  },
  lyonChallengeFaq: {
    title: "Forever Strong Foundations Challenge FAQ — Dr. Gabrielle Lyon",
    url: "https://drgabriellelyon.com/forever-strong-foundations-challenge/",
  },
  simsStart: {
    title: "Where Do I Start? A Roadmap for Active Women — Dr. Stacy Sims",
    url: "https://www.drstacysims.com/newsletters/articles/posts/where-do-i-start-health-roadmap-for-active-women",
  },
  simsProtein: {
    title: "Why Women Need to Prioritize Protein — Dr. Stacy Sims",
    url: "https://www.drstacysims.com/newsletters/articles/posts/Why_Women_Need_to_Prioritize_Protein",
  },
  simsPostpartum: {
    title: "Female Athletes Are Redefining Active Pregnancy — Dr. Stacy Sims",
    url: "https://www.drstacysims.com/newsletters/articles/posts/Female_Athletes_Are_Redefining_Active_Pregnancy",
  },
  simsHuberman: {
    title: "Dr. Stacy Sims on Huberman Lab — Female-Specific Exercise & Nutrition (transcript)",
    url: "https://www.hubermanlab.com/episode/dr-stacy-sims-female-specific-exercise-nutrition-for-health-performance-longevity",
  },
  simsCreatine: {
    title: "Why Active Women Need Creatine — Dr. Stacy Sims",
    url: "https://www.drstacysims.com/newsletters/articles/posts/Why_Active_Women_Need_Creatine",
  },
  odsVitaminD: { title: "Vitamin D — NIH Office of Dietary Supplements (upper limits, Table 4)", url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/" },
} satisfies Record<string, Source>;

export type Expert = "lyon" | "sims";
export const EXPERT_NAMES: Record<Expert, string> = { lyon: "Dr. Lyon", sims: "Dr. Sims" };

export type ExpertNote = { who: Expert; text: string; quote: string; source: Source };

// ── Protein ──────────────────────────────────────────────────────────────────

export type ProteinMethod = {
  id: Expert;
  /** What weight the grams-per-pound applies to — they differ. */
  weightBasis: "goal" | "current";
  weightLabel: string;
  low: number;
  high: number;
  summary: string;
  quote: string;
  source: Source;
};

export const PROTEIN_METHODS: Record<Expert, ProteinMethod> = {
  lyon: {
    id: "lyon",
    weightBasis: "goal",
    weightLabel: "Goal weight (lb)",
    low: 0.7,
    high: 1.0,
    summary: "1 g per pound of ideal (goal) body weight; 0.7 g/lb at the low end.",
    quote:
      "roughly one gram per pound ideal body weight. An individual could certainly go to 0.7 grams per pound ideal body weight.",
    source: EXPERT_SOURCES.lyonHuberman,
  },
  sims: {
    id: "sims",
    weightBasis: "current",
    weightLabel: "Current weight (lb)",
    low: 0.7,
    high: 1.0,
    summary: "0.7–1.0 g per pound of body weight (1.6–2.2 g/kg), written for active women.",
    quote: "Prioritize protein, aiming for 0.7-1.0 grams per pound (1.6 to 2.2 grams per kilogram) of body weight daily.",
    source: EXPERT_SOURCES.simsStart,
  },
};

export class ExpertError extends Error {}

/** The two ends of an expert's protein range for a weight, in whole grams. */
export function proteinRange(method: Expert, weightLb: number): { low: number; high: number } {
  if (!Number.isFinite(weightLb) || weightLb < 80 || weightLb > 400) throw new ExpertError("weight must be in pounds, between 80 and 400");
  const m = PROTEIN_METHODS[method];
  return { low: Math.round(m.low * weightLb), high: Math.round(m.high * weightLb) };
}

/** The note saved with a goal, so the page can say where the number came from. */
export function proteinGoalNote(method: Expert, weightLb: number, grams: number): string {
  const m = PROTEIN_METHODS[method];
  const perLb = Math.round((grams / weightLb) * 100) / 100;
  return `${EXPERT_NAMES[method]}: ${perLb} g/lb × ${weightLb} lb ${m.weightBasis === "goal" ? "goal" : "current"} weight`;
}

/** Both agree on about 30 g at each meal. */
export const PER_MEAL_PROTEIN = 30;
export const PER_MEAL_NOTES: ExpertNote[] = [
  {
    who: "lyon",
    text: "Three meals a day, each with at least 30 g of protein.",
    quote: "I recommend three meals each day for most adults with a minimum of 30 grams of high quality protein to optimize muscle protein synthesis.",
    source: EXPERT_SOURCES.lyonProtocol,
  },
  {
    who: "sims",
    text: "30–40 g at each meal and 15–20 g at snacks.",
    quote: "regular doses of 30 to 40 grams of protein at each meal and 15 to 20 at your snacks.",
    source: EXPERT_SOURCES.simsProtein,
  },
];

export type MealProtein = { meal: string; grams: number; entries: number };

/** Protein per meal today. Entries without a meal fall under "snack". */
export function proteinByMeal(rows: Array<{ payload: { meal?: string; nutrients?: { protein_g?: number } } }>): MealProtein[] {
  const order = ["breakfast", "lunch", "dinner", "snack"];
  const out = new Map<string, MealProtein>(order.map((m) => [m, { meal: m, grams: 0, entries: 0 }]));
  for (const r of rows) {
    const meal = order.includes(r.payload.meal ?? "") ? r.payload.meal! : "snack";
    const g = Number(r.payload.nutrients?.protein_g);
    const hit = out.get(meal)!;
    hit.entries++;
    if (Number.isFinite(g)) hit.grams = Math.round((hit.grams + g) * 10) / 10;
  }
  return order.map((m) => out.get(m)!);
}

// ── Movement and fueling ─────────────────────────────────────────────────────

/** Before the OB clears her: both experts point back to the doctor. */
export const BEFORE_CLEARANCE: ExpertNote[] = [
  {
    who: "lyon",
    text: "Train once the doctor says it's safe.",
    quote: "If your doctor says that you’re safe to workout – you bet! … Always discuss this with a trusted healthcare provider.",
    source: EXPERT_SOURCES.lyonChallengeFaq,
  },
  {
    who: "sims",
    text: "Ease back in after birth, and eat enough — fuel needs rise postpartum.",
    quote: "Ease back into it when coming back postpartum, and make sure you’re eating enough to avoid injury.",
    source: EXPERT_SOURCES.simsPostpartum,
  },
];

/** After clearance: how each builds training back. */
export const AFTER_CLEARANCE: ExpertNote[] = [
  {
    who: "lyon",
    text: "Resistance training, starting at 2 days a week — body weight or bands are fine to start.",
    quote:
      "Resistance training is non-negotiable. It doesn't matter if you need to start with body weight, absolutely okay. Move to bands. … Start with two days a week. You will likely progress to three days a week.",
    source: EXPERT_SOURCES.lyonHuberman,
  },
  {
    who: "sims",
    text: "2–3 strength sessions and 1–2 hard efforts a week, the rest easy movement she enjoys. Don't train fasted.",
    quote:
      "Think: two to three strength sessions, one to two high-intensity efforts, and fill the rest of your week with movement you enjoy. … Avoid training fasted, particularly for high-intensity or strength sessions",
    source: EXPERT_SOURCES.simsStart,
  },
];

export const FUELING: ExpertNote = {
  who: "sims",
  text: "Under-eating is the most common mistake she sees in active women.",
  quote: "Underfueling is the most common mistake I see in active women, and it quietly undermines everything else.",
  source: EXPERT_SOURCES.simsStart,
};

/** Strength sessions Lyon starts with; the app counts them once she's cleared. */
export const STRENGTH_START_PER_WEEK = 2;
export const STRENGTH_ACTIVITIES = ["strength", "pt"];

// ── Where their advice doesn't reach, and why the app leaves it out ──────────

export const NOT_APPLIED: Array<{ text: string; sources: Source[] }> = [
  {
    text: "Neither has published a protein, calorie or training plan for breastfeeding, the weeks after a cesarean, or rheumatoid arthritis. Their numbers are for adults or active women in general — so they're offered as a goal she can choose, not as defaults.",
    sources: [EXPERT_SOURCES.lyonHuberman, EXPERT_SOURCES.simsStart],
  },
  {
    text: "Dr. Lyon's worked example — a 140-lb woman losing 15 lb, at 1,470 calories with 130 g of carbs (90–130 g for less active people) — is a fat-loss template. Breastfeeding raises the carbohydrate RDA to 210 g a day, and MedlinePlus advises against cutting calories hard before the baby is 2 months old.",
    sources: [EXPERT_SOURCES.lyonProtocol, NUTRITION_SOURCES.dri, NUTRITION_SOURCES.medlinePlus],
  },
  {
    text: "Dr. Sims's sprint intervals, heavy lifting and jump training wait for the OB's clearance — and she framed jump training for women over 50.",
    sources: [EXPERT_SOURCES.simsHuberman, NUTRITION_SOURCES.acogExercise],
  },
  {
    text: "Dr. Sims has said 2,000–5,000 IU of vitamin D3, depending on sun exposure; NIH's upper limit while breastfeeding is 4,000 IU (100 mcg) a day.",
    sources: [EXPERT_SOURCES.simsHuberman, EXPERT_SOURCES.odsVitaminD],
  },
  {
    text: "Creatine: Dr. Sims's guidance is for active women with no relevant medical conditions, and neither expert addresses breastfeeding. A question for the OB and rheumatologist, with LactMed.",
    sources: [EXPERT_SOURCES.simsCreatine],
  },
];
