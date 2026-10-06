/**
 * Recovery safety rules, each quoted from the page it comes from (checked
 * 2026-10-05). These are the published warning thresholds — what a care team
 * hands out on discharge — not a reading of anyone's health. The app shows the
 * matching instruction and the source; deciding what it means is the care team's.
 *
 * Where sources differ, the stricter postpartum source wins: severe blood
 * pressure is 160/110 here (ACOG, Preeclampsia Foundation), not the general
 * adult 180/120.
 */

export type Source = { title: string; url: string };

export const SOURCES = {
  awhonn: {
    title: "POST-BIRTH Warning Signs — AWHONN",
    url: "https://saveyourlife.awhonn.org/wp-content/plugins/save-your-life-downloads-admin/assets/pdfs/PBWSSaveYourLifeHandout_English.pdf",
  },
  cdcHearHer: { title: "Urgent Maternal Warning Signs — CDC Hear Her", url: "https://www.cdc.gov/hearher/maternal-warning-signs/index.html" },
  pfBp: { title: "Blood Pressure — Preeclampsia Foundation", url: "https://www.preeclampsia.org/blood-pressure" },
  pfPostpartum: { title: "Postpartum Preeclampsia — Preeclampsia Foundation", url: "https://www.preeclampsia.org/postpartum-preeclampsia" },
  acogPreeclampsia: {
    title: "Preeclampsia and High Blood Pressure — ACOG",
    url: "https://www.acog.org/womens-health/faqs/preeclampsia-and-high-blood-pressure-during-pregnancy",
  },
  oaaHeadache: {
    title: "Headache after an epidural or spinal — Obstetric Anaesthetists' Association",
    url: "https://www.labourpains.org/home-special-circumstances/headache-after-an-epidural-or-spinal-injection",
  },
  asaPdph: {
    title: "Statement on Post-Dural Puncture Headache Management — ASA",
    url: "https://www.asahq.org/standards-and-practice-parameters/statement-on-post-dural-puncture-headache-management",
  },
  acogCesarean: { title: "Cesarean Birth — ACOG", url: "https://www.acog.org/womens-health/faqs/cesarean-birth" },
  ahaHowTo: {
    title: "How to measure your blood pressure — American Heart Association",
    url: "https://www.heart.org/-/media/Files/Health-Topics/High-Blood-Pressure/How_to_Measure_Your_Blood_Pressure_Letter_Size.pdf",
  },
  lactmed: { title: "Drugs and Lactation Database (LactMed) — NIH", url: "https://www.ncbi.nlm.nih.gov/books/NBK501922/" },
  acogPostpartumCare: {
    title: "Optimizing Postpartum Care — ACOG Committee Opinion 736",
    url: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2018/05/optimizing-postpartum-care",
  },
  acogPpd: { title: "Postpartum Depression — ACOG", url: "https://www.acog.org/womens-health/faqs/postpartum-depression" },
  hrsa: {
    title: "National Maternal Mental Health Hotline — HRSA",
    url: "https://mchb.hrsa.gov/programs-impact/national-maternal-mental-health-hotline",
  },
  psi: { title: "Get Help — Postpartum Support International", url: "https://postpartum.net/get-help/" },
  acr: { title: "Pregnancy and Rheumatic Disease — American College of Rheumatology", url: "https://rheumatology.org/pregnancy-rheumatic-disease" },
  arthritisFoundation: {
    title: "Rheumatoid Arthritis and Pregnancy — Arthritis Foundation",
    url: "https://www.arthritis.org/health-wellness/healthy-living/family-relationships/family-planning/rheumatoid-arthritis-and-pregnancy",
  },
} satisfies Record<string, Source>;

// ── Blood pressure ───────────────────────────────────────────────────────────

export type BpBand = "severe" | "high" | "under";

/**
 * Preeclampsia Foundation: "less than 140/90 — Normal (Keep checking) ·
 * between 140-159 / 90-109 — Call your healthcare provider · 160/110 or higher —
 * Seek immediate medical care", and "If either your top (systolic) or bottom
 * (diastolic) number falls out of the normal range, take action."
 */
export function bpBand(systolic: number, diastolic: number): BpBand {
  if (systolic >= 160 || diastolic >= 110) return "severe";
  if (systolic >= 140 || diastolic >= 90) return "high";
  return "under";
}

export const BP_ACTION: Record<BpBand, { label: string; action: string }> = {
  severe: {
    label: "160/110 or higher",
    action:
      "Get medical care right away — go to Labor & Delivery or the ER and say you recently gave birth. Don't wait for a second reading to decide.",
  },
  high: { label: "140–159 / 90–109", action: "Call your OB now." },
  under: { label: "Under 140/90", action: "Keep checking." },
};

/** Parse "128/84" or two fields; null if it isn't a plausible reading. */
export function parseBp(systolic: string, diastolic: string): { systolic: number; diastolic: number } | null {
  const s = Number(systolic);
  const d = Number(diastolic);
  if (!Number.isInteger(s) || !Number.isInteger(d)) return null;
  if (s < 50 || s > 300 || d < 20 || d > 200 || d >= s) return null;
  return { systolic: s, diastolic: d };
}

// ── Daily check-in ───────────────────────────────────────────────────────────

export type CheckIn = {
  headache?: number; // 0–10
  headache_lying?: "better" | "same" | "unsure";
  headache_after_meds?: "better" | "not_better";
  vision_changes?: boolean;
  pain?: number; // 0–10
  temp_f?: number;
  bleeding?: "light" | "moderate" | "soaking"; // soaking = a pad an hour, or egg-size clots
  incision?: "fine" | "red" | "draining" | "not_healing";
  leg?: boolean; // red or swollen leg, painful or warm
  mood?: "good" | "ok" | "low";
  urgent?: Array<"chest_pain" | "breathing" | "seizure" | "harm_thoughts">;
  note?: string;
};

export type Warning = {
  level: "911" | "call" | "info";
  text: string;
  source: Source;
};

/**
 * The warning signs this check-in matches. AWHONN: "All you need is one sign."
 * The bp argument, when given, is the latest reading, so a headache with high
 * blood pressure is raised together.
 */
export function checkInWarnings(c: CheckIn, bp?: { systolic: number; diastolic: number } | null): Warning[] {
  const out: Warning[] = [];
  const urgent = c.urgent ?? [];
  if (urgent.includes("harm_thoughts"))
    out.push({
      level: "911",
      text: "Thoughts of hurting yourself or someone else: call 911 or 988 now.",
      source: SOURCES.awhonn,
    });
  if (urgent.some((u) => u !== "harm_thoughts"))
    out.push({ level: "911", text: "Chest pain, trouble breathing or a seizure: call 911.", source: SOURCES.awhonn });

  const band = bp ? bpBand(bp.systolic, bp.diastolic) : null;
  if (band === "severe") out.push({ level: "911", text: `Blood pressure ${bp!.systolic}/${bp!.diastolic}: ${BP_ACTION.severe.action}`, source: SOURCES.pfBp });

  if (c.vision_changes)
    out.push({
      level: "call",
      text: "Headache or vision changes may mean high blood pressure or postpartum preeclampsia. Call your OB now; if you can't reach them, go to the ER.",
      source: SOURCES.awhonn,
    });
  if ((c.headache ?? 0) > 0 && c.headache_after_meds === "not_better")
    out.push({
      level: "call",
      text: "A headache that doesn't get better after medicine: call your OB or the anesthesia team.",
      source: SOURCES.awhonn,
    });
  if ((c.headache ?? 0) > 0 && band === "high")
    out.push({
      level: "call",
      text: "Headache with blood pressure 140/90 or higher: call your OB now.",
      source: SOURCES.pfBp,
    });
  if (c.temp_f !== undefined && (c.temp_f >= 100.4 || c.temp_f <= 96.8))
    out.push({ level: "call", text: `Temperature ${c.temp_f}°F: call your OB.`, source: SOURCES.awhonn });
  if (c.bleeding === "soaking")
    out.push({ level: "call", text: "Soaking a pad an hour, or clots egg-size or bigger: call your OB.", source: SOURCES.awhonn });
  if (c.incision && c.incision !== "fine")
    out.push({ level: "call", text: "Incision red, draining or not healing: call your OB.", source: SOURCES.acogCesarean });
  if (c.leg)
    out.push({ level: "call", text: "A red or swollen leg that's painful or warm: call your OB.", source: SOURCES.awhonn });

  if ((c.headache ?? 0) > 0 && c.headache_lying === "better" && !out.some((w) => w.level !== "info"))
    out.push({
      level: "info",
      text: "A spinal headache usually eases lying down. If it isn't helped by painkillers, the anesthesia team can offer other treatment.",
      source: SOURCES.oaaHeadache,
    });
  if (c.mood === "low")
    out.push({
      level: "info",
      text: "Low days are common in the first weeks; if it lasts beyond about two weeks or feels heavy, don't wait for the checkup — tell the OB. 24/7 support: 1-833-TLC-MAMA (1-833-852-6262).",
      source: SOURCES.acogPpd,
    });
  return out;
}

/** "Day 5 after birth"; null without a date. Day of birth is day 0. */
export function daysSince(dateIso: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateIso) return null;
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  const born = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((today - born) / 86_400_000);
  return n >= 0 ? n : null;
}
