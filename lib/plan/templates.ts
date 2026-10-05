/**
 * Prep checklists for an event, copied onto the event when it is created so
 * they can be ticked, answered and edited like anything the family adds.
 *
 * Every item names the page it comes from, and each was checked against that
 * live page (2026-10-05) — the quote that supports it is kept beside it here so
 * the next person can re-check it. Wording is the family's to change; the source
 * is what makes the item worth showing. No doses, no thresholds of our own: the
 * one number (the fever temperature) is the AAP's, quoted.
 */

export type ItemKind = "question" | "bring" | "prep";

export interface TemplateItem {
  key: string;
  kind: ItemKind;
  body: string;
  detail?: string;
  source: { title: string; url: string };
}

const S = {
  checklistNewborn: {
    title: "Your Checkup Checklist: Newborn Visit (2–5 days) — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/ages-stages/Your-Childs-Checkups/Pages/Your-Checkup-Checklist-Newborn-Visit-2-to-5-days-old.aspx",
  },
  checklist1m: {
    title: "Your Checkup Checklist: 1 Month Old — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/ages-stages/Your-Childs-Checkups/Pages/Your-Checkup-Checklist-1-month-old.aspx",
  },
  firstMonthGrowth: {
    title: "First Month: Physical Appearance and Growth — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/ages-stages/baby/Pages/First-Month-Physical-Appearance-and-Growth.aspx",
  },
  jaundice: {
    title: "Jaundice in Newborns — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/ages-stages/baby/Pages/Jaundice.aspx",
  },
  fever: {
    title: "When to Call the Pediatrician: Fever — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/health-issues/conditions/fever/Pages/When-to-Call-the-Pediatrician.aspx",
  },
  cord: {
    title: "Umbilical Cord Care — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/ages-stages/baby/bathing-skin-care/Pages/Umbilical-Cord-Care.aspx",
  },
  wellChild: {
    title: "Well-Child Care: A Check-Up for Success — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/family-life/health-management/Pages/Well-Child-Care-A-Check-Up-for-Success.aspx",
  },
  ahrq: {
    title: "Be More Engaged in Your Healthcare — AHRQ",
    url: "https://www.ahrq.gov/questions/be-engaged/index.html",
  },
  checklist4y: {
    title: "Your Checkup Checklist: 4 Years Old — AAP, HealthyChildren.org",
    url: "https://www.healthychildren.org/English/ages-stages/Your-Childs-Checkups/Pages/your-checkup-checklist-4-years-old.aspx",
  },
  cdc4y: {
    title: "Milestones by 4 Years — CDC Learn the Signs. Act Early.",
    url: "https://www.cdc.gov/act-early/milestones/4-years.html",
  },
  cdcIndex: {
    title: "Milestone Checklists — CDC Learn the Signs. Act Early.",
    url: "https://www.cdc.gov/act-early/milestones/index.html",
  },
  naeyc: {
    title: "It's Conference Time! — NAEYC",
    url: "https://www.naeyc.org/resources/pubs/tyc/oct2018/backpack/its-conference-time",
  },
  understood: {
    title: "Questions to Ask at Your Parent-Teacher Conference — Understood.org",
    url: "https://www.understood.org/en/articles/checklist-questions-to-ask-at-your-parent-teacher-conference",
  },
  pta: {
    title: "Parent-Teacher Conference Guide — National PTA",
    url: "https://www.pta.org/docs/default-source/uploadedfiles/ufen-parent-teacher-conference-guide.pdf",
  },
} as const;

const TOP_QUESTIONS: TemplateItem = {
  key: "gen-top3",
  kind: "prep",
  body: "Pick your top 3–5 questions and raise them at the start of the visit",
  // "Bring your top three to five questions or concerns with you to talk with
  // your pediatrician at the start of the visit."
  source: S.wellChild,
};
const BRING_MEDS: TemplateItem = {
  key: "gen-meds",
  kind: "bring",
  body: "Every medicine and vitamin they take",
  // "Bring all the medicines you take to your appointment."
  source: S.ahrq,
};

/** First visits: the 3–5 day newborn visit through the 1-month visit. */
export const NEWBORN_VISIT: TemplateItem[] = [
  TOP_QUESTIONS,
  {
    key: "nb-weight",
    kind: "question",
    body: "Is baby back to birth weight?",
    detail: "Most babies are by about 2 weeks; almost all by 3 weeks.",
    // "by about 2 weeks of age, they should be back at their original birth weight.
    // Almost all babies will have regained their birth weight by 3 weeks of age."
    source: S.firstMonthGrowth,
  },
  {
    key: "nb-bilirubin",
    kind: "question",
    body: "What is baby's bilirubin (jaundice) level, and is a follow-up check needed?",
    // "Ask your baby's healthcare provider about their bilirubin level and schedule
    // a follow-up appointment."
    source: S.jaundice,
  },
  {
    key: "nb-vitamin-d",
    kind: "question",
    body: "Breastfed? Ask about vitamin D drops",
    detail: "The AAP recommends a vitamin D supplement for breastfed babies, starting in the first few days of life.",
    // "Is your breastfed baby getting a vitamin D supplement? (The AAP recommends …
    // supplemental vitamin D daily, beginning in the first few days of life.)"
    source: S.checklistNewborn,
  },
  {
    key: "nb-screens",
    kind: "question",
    body: "What were the hospital hearing and blood screening results?",
    // "Your pediatrician will review the results of two screenings that all babies
    // receive in the hospital for hearing and blood."
    source: S.checklistNewborn,
  },
  {
    key: "nb-fever",
    kind: "question",
    body: "When should we call you, day or night?",
    detail: "AAP: under 3 months, call right away for a temperature of 100.4°F (38.0°C) or higher.",
    // "Is younger than 3 months (12 weeks) and has a temperature of 100.4°F (38.0°C) or higher"
    source: S.fever,
  },
  {
    key: "nb-thermometer",
    kind: "question",
    body: "Can you show us how to take a rectal temperature?",
    // "Can you show me how to safely use a rectal thermometer to take my baby's temperature?"
    source: S.checklistNewborn,
  },
  {
    key: "nb-cord",
    kind: "question",
    body: "Does the cord stump look right?",
    detail:
      "It should dry and fall off by 3 weeks. Call right away if it actively bleeds; call about foul-smelling discharge or red skin at the base.",
    // "The umbilical cord stump should dry and fall off by the time your baby is 3 weeks old."
    source: S.cord,
  },
  {
    key: "nb-crying",
    kind: "question",
    body: "What do we do when the crying is too much?",
    // "What do I do when the crying is too much?"
    source: S.checklist1m,
  },
  {
    key: "nb-cpr",
    kind: "question",
    body: "Where can we learn infant CPR?",
    // "Where can I learn infant CPR?"
    source: S.checklist1m,
  },
  {
    key: "nb-paperwork",
    kind: "bring",
    body: "Hospital discharge paperwork",
    detail: "Including discharge weight and anything from the pregnancy or birth.",
    // "Hospital paperwork—including information about your baby's discharge weight
    // or complications during pregnancy or birth."
    source: S.checklistNewborn,
  },
  {
    key: "nb-log",
    kind: "bring",
    body: "The feed and diaper numbers — shown below on this page",
    detail: "They'll ask how many wet diapers and stools a day.",
    // "How many wet diapers and stools does your baby have each day?"
    source: S.checklist1m,
  },
  BRING_MEDS,
  {
    key: "nb-ready",
    kind: "prep",
    body: "Know your car seat type and where baby sleeps — they'll ask",
    // "Where is your baby sleeping at night?" / "What kind of car seat do you have?"
    source: S.checklist1m,
  },
  {
    key: "nb-parent",
    kind: "prep",
    body: "Expect to be asked how you're feeling — sadness and anxiety are worth raising",
    // "Your pediatrician might also ask how you are feeling. If you are feeling
    // anxious or sad, or anything else, you are not alone and your pediatrician is
    // ready to help."
    source: S.checklist1m,
  },
];

/** Preschool checkups (about 3½ to 5): built on the AAP 4-year checklist. */
export const PRESCHOOL_VISIT: TemplateItem[] = [
  TOP_QUESTIONS,
  {
    key: "ps-milestones",
    kind: "prep",
    body: "Go through the CDC milestone checklist before the visit",
    // "Talk with your child's doctor, share your concerns, and ask about developmental screening."
    source: S.cdc4y,
  },
  {
    key: "ps-concerns",
    kind: "question",
    body: "Anything they do or don't do that concerns us? Any skills lost?",
    // "Is there anything your child does or does not do that concerns you?" /
    // "Has your child lost any skills he/she once had?"
    source: S.cdc4y,
  },
  {
    key: "ps-school",
    kind: "question",
    body: "Is our child ready for school? Ready to read?",
    // "Is my child ready for school? Is my child ready to read?"
    source: S.checklist4y,
  },
  {
    key: "ps-booster",
    kind: "question",
    body: "Car seat or booster — which fits now?",
    detail: "Most 4-year-olds aren't yet big enough for a booster seat.",
    // "Most 4-year-olds aren't yet big enough for a booster seat."
    source: S.checklist4y,
  },
  {
    key: "ps-screens",
    kind: "prep",
    body: "Expect hearing, vision (likely an eye chart) and oral health checks",
    // "A full physical exam will be performed along with hearing, vision and oral
    // health screenings. The vision screening likely will involve an eye chart."
    source: S.checklist4y,
  },
  {
    key: "ps-topics",
    kind: "prep",
    body: "Be ready to talk about school readiness, eating, screen time and safety",
    // "they may talk with you about school readiness, healthy nutrition and habits,
    // screen time and injury prevention."
    source: S.checklist4y,
  },
  {
    key: "ps-media",
    kind: "prep",
    body: "Have a family media plan, or ask for help making one",
    // "Does your family have a media use plan?"
    source: S.checklist4y,
  },
  BRING_MEDS,
];

/** Any other medical appointment. */
export const MEDICAL_VISIT: TemplateItem[] = [
  TOP_QUESTIONS,
  {
    key: "gen-write",
    kind: "prep",
    body: "Write the questions down before you go",
    // "Write down the questions you have for the visit."
    source: S.ahrq,
  },
  BRING_MEDS,
];

/** Parent–teacher meetings (preschool and up). */
export const SCHOOL_MEETING: TemplateItem[] = [
  {
    key: "sc-list",
    kind: "prep",
    body: "List your questions, most important first, and leave time to hear the teacher",
    // "Make a list of your questions and concerns, and prioritize them—you'll want
    // to leave plenty of time to hear the teacher's thoughts."
    source: S.naeyc,
  },
  {
    key: "sc-examples",
    kind: "prep",
    body: "Think of examples of how your child plays and learns at home",
    // "Think of examples to share with the teacher of how your child plays and learns at home."
    source: S.naeyc,
  },
  {
    key: "sc-changes",
    kind: "prep",
    body: "Mention changes at home that might show up at school — like a new sibling",
    // "Talk about changes or challenges that might impact your child at school"
    source: S.naeyc,
  },
  {
    key: "sc-learn",
    kind: "question",
    body: "What is our child expected to learn this year?",
    // "What is my child expected to learn this year?"
    source: S.understood,
  },
  {
    key: "sc-strengths",
    kind: "question",
    body: "What are our child's strengths, and where could they grow?",
    // "What are my child's strengths and weaknesses?"
    source: S.pta,
  },
  {
    key: "sc-social",
    kind: "question",
    body: "How are our child's social skills? Do they seem happy at school?",
    // "How are my child's social skills?" / "Does my child seem happy at school?"
    source: S.understood,
  },
  {
    key: "sc-home",
    kind: "question",
    body: "What can we try at home to support their learning?",
    // "Ask about activities and ideas you can try at home to support your child's learning."
    source: S.naeyc,
  },
  {
    key: "sc-solve",
    kind: "question",
    body: "If there are concerns, how can we problem-solve together?",
    // "If you have concerns, ask how you can problem-solve together."
    source: S.naeyc,
  },
  {
    key: "sc-contact",
    kind: "question",
    body: "What's the best way to stay in touch and keep up with class news?",
    // "Ask about the best ways to continue communicating with the teacher and how to
    // stay up-to-date with class news throughout the year."
    source: S.naeyc,
  },
  {
    key: "sc-notes",
    kind: "bring",
    body: "Something to take notes on",
    // "Take notes of important comments."
    source: S.pta,
  },
];

export type EventKind = "medical" | "school" | "activity" | "family" | "other";

/**
 * Which checklist an event starts with. By kind, then by the child's age on the
 * day: the newborn list covers the first visits up to about six weeks; the
 * preschool list from about 3½ to 5½. Outside those, a medical visit gets the
 * short general list rather than one written for another age.
 */
export function templateFor(kind: EventKind, ageDaysOnTheDay: number | null): {
  name: string;
  items: TemplateItem[];
} | null {
  if (kind === "school") return { name: "Parent–teacher meeting", items: SCHOOL_MEETING };
  if (kind !== "medical") return null;
  if (ageDaysOnTheDay !== null && ageDaysOnTheDay <= 45) return { name: "Newborn & 1-month visit", items: NEWBORN_VISIT };
  if (ageDaysOnTheDay !== null && ageDaysOnTheDay >= 1278 && ageDaysOnTheDay <= 2008)
    return { name: "Preschool checkup", items: PRESCHOOL_VISIT };
  return { name: "Doctor visit", items: MEDICAL_VISIT };
}

export const MILESTONES_INDEX = S.cdcIndex;
