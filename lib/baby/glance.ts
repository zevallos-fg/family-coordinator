/**
 * The Kids at-a-glance numbers, and the published ranges shown beside them.
 *
 * Two rules hold everything here:
 *
 * 1. A range is shown next to a count, never compared with it. There is no
 *    "low", no colour, no warning. Whether her numbers are fine is a question
 *    for her pediatrician, who sees things this screen cannot. The range is
 *    there so nobody has to remember it at 4am.
 * 2. Every range quotes a named source with a link, and only for the ages that
 *    source describes. Outside those ages, no range is shown at all.
 *
 * Counts are a rolling 24 hours, because that is how every source states them.
 */

export interface GuideSource {
  title: string;
  url: string;
}

export interface Guide {
  /** Short, for the tile: "8–12". */
  range: string;
  title: string;
  /** What the source says, in plain words. */
  body: string;
  source: GuideSource;
  /** Wake windows: a convention, not research. Said on the screen. */
  ruleOfThumb?: boolean;
}

export type GuideKey = "feeds" | "wet" | "stools" | "sleep" | "wake";

const AAP_FEEDING: GuideSource = {
  title: "How Often and How Much Should Your Baby Eat? — AAP, HealthyChildren.org",
  url: "https://www.healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/How-Often-and-How-Much-Should-Your-Baby-Eat.aspx",
};
const AAP_ENOUGH_MILK: GuideSource = {
  title: "How to Tell if Your Breastfed Baby is Getting Enough Milk — AAP, HealthyChildren.org",
  url: "https://www.healthychildren.org/English/ages-stages/baby/breastfeeding/Pages/How-to-Tell-if-Baby-is-Getting-Enough-Milk.aspx",
};
const NSF_SLEEP: GuideSource = {
  title: "Sleep Duration Recommendations — National Sleep Foundation",
  url: "https://www.thensf.org/sleep-duration-recommendations/",
};
const SF_WAKE: GuideSource = {
  title: "Newborn Wake Windows — Sleep Foundation",
  url: "https://www.sleepfoundation.org/baby-sleep/newborn-wake-windows",
};
export const AAP_SAFE_SLEEP: GuideSource = {
  title: "Safe Sleep: Back is Best — AAP, HealthyChildren.org",
  url: "https://www.healthychildren.org/English/news/Pages/safe-sleep-back-is-best-avoid-soft-bedding-inclined-surfaces-and-bedsharing.aspx",
};

export const SAFE_SLEEP_POINTS = [
  "On the back, every sleep.",
  "A firm, flat surface that isn't inclined — crib or bassinet.",
  "Nothing else in it: no pillows, blankets, bumpers or soft toys.",
  "Same room, not the same bed — for at least the first six months.",
  "Car seats, swings, strollers and carriers aren't for routine sleep, especially under 4 months.",
];

/**
 * Whole days since birth, by calendar date where the phone is. The day she was
 * born is day 0. Null without a birth date.
 */
export function ageInDays(birthDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const born = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - born) / 86_400_000);
  return days >= 0 ? days : null;
}

/** Completed calendar months since birth. */
export function ageInMonths(birthDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  let months = (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() - (Number(m[2]) - 1));
  if (now.getDate() < Number(m[3])) months--;
  return months >= 0 ? months : null;
}

/**
 * The ranges that apply at this age. A key is absent when no source here
 * describes that age — the tile then shows the count alone.
 */
export function guidesFor(birthDate: string | null | undefined, now: Date = new Date()): Partial<Record<GuideKey, Guide>> {
  const days = ageInDays(birthDate, now);
  const months = ageInMonths(birthDate, now);
  if (days === null || months === null) return {};
  const out: Partial<Record<GuideKey, Guide>> = {};

  // The AAP feeding page describes newborns.
  if (days < 61) {
    out.feeds = {
      range: "8–12",
      title: "Feeds in 24 hours",
      body:
        "Breastfed newborns usually nurse about every 2 hours, start to start — 10 to 12 times in 24 hours is the norm. Bottle-fed newborns usually eat every 2 to 3 hours, and 8 times in 24 hours is generally the minimum.",
      source: AAP_FEEDING,
    };
  }

  // Wet diapers: 2–3 a day in the first days; 6 or more by 5–7 days old.
  if (days < 5) {
    out.wet = {
      range: "2–3",
      title: "Wet diapers in 24 hours",
      body:
        "In the first days after birth, 2 to 3 wet diapers a day. After the first 4 to 5 days, that rises to at least 5 to 6.",
      source: AAP_FEEDING,
    };
  } else if (days < 61) {
    out.wet = {
      range: "6+",
      title: "Wet diapers in 24 hours",
      body: "By 5 to 7 days old, 6 or more wet diapers a day, with pale or nearly colourless urine.",
      source: AAP_ENOUGH_MILK,
    };
  }

  // Stools change fastest, and the source describes only the first week, so the
  // range stops at a month rather than follow her past what it covers.
  if (days <= 1) {
    out.stools = {
      range: "1–2",
      title: "Dirty diapers in 24 hours",
      body: "Days 1 and 2: 1 or 2 bowel movements a day, blackish and tarry.",
      source: AAP_ENOUGH_MILK,
    };
  } else if (days <= 4) {
    out.stools = {
      range: "2+",
      title: "Dirty diapers in 24 hours",
      body: "Days 3 and 4: at least two stools a day, starting to turn greenish to yellow.",
      source: AAP_ENOUGH_MILK,
    };
  } else if (days < 30) {
    out.stools = {
      range: "3–4+",
      title: "Dirty diapers in 24 hours",
      body:
        "By 5 to 7 days old: yellow, loose stools with small curds, at least 3 to 4 a day. This describes the first weeks; patterns change after that.",
      source: AAP_ENOUGH_MILK,
    };
  }

  // NSF bands, total sleep in 24 hours including naps.
  const band =
    months < 4
      ? { range: "14–17h", who: "newborns (0–3 months)" }
      : months < 12
        ? { range: "12–15h", who: "infants (4–11 months)" }
        : months < 36
          ? { range: "11–14h", who: "toddlers (1–2 years)" }
          : months < 72
            ? { range: "10–13h", who: "preschoolers (3–5 years)" }
            : null;
  if (band) {
    out.sleep = {
      range: band.range,
      title: "Sleep in 24 hours",
      body: `The National Sleep Foundation's recommended range for ${band.who} is ${band.range.replace("h", " hours")} in 24 hours, naps included. Individual needs vary.`,
      source: NSF_SLEEP,
    };
  }

  if (days < 30) {
    out.wake = {
      range: "30–90m",
      title: "Wake window",
      body:
        "A typical wake window at 0–1 month is 30 to 90 minutes. Every baby is different, it changes day to day, and unpredictable newborn sleep is normal.",
      source: SF_WAKE,
      ruleOfThumb: true,
    };
  } else if (months < 4) {
    out.wake = {
      range: "1–3h",
      title: "Wake window",
      body:
        "A typical wake window at 1–4 months is 1 to 3 hours. Every baby is different and it changes day to day.",
      source: SF_WAKE,
      ruleOfThumb: true,
    };
  }

  return out;
}

type LaneEvent = {
  event_type: string;
  kid_id: string | null;
  started_at: string;
  ended_at: string | null;
  payload: unknown;
};

function forKid(e: LaneEvent, kidId: string | null) {
  return kidId === null || e.kid_id === kidId;
}

function contentsOf(e: LaneEvent): string | null {
  const p = e.payload as Record<string, unknown> | null;
  return p && typeof p.contents === "string" ? p.contents : null;
}

/** Counts over the 24 hours ending now. Sleep is clipped to the window. */
export function rolling24h(
  events: LaneEvent[],
  kidId: string | null,
  nowMs: number
): { feeds: number; wet: number; stools: number; sleepSeconds: number } {
  const from = nowMs - 24 * 3600 * 1000;
  let feeds = 0;
  let wet = 0;
  let stools = 0;
  let sleepMs = 0;
  for (const e of events) {
    if (!forKid(e, kidId)) continue;
    const start = Date.parse(e.started_at);
    if (!Number.isFinite(start)) continue;
    if (e.event_type === "sleep") {
      const end = e.ended_at ? Date.parse(e.ended_at) : nowMs;
      sleepMs += Math.max(0, Math.min(end, nowMs) - Math.max(start, from));
      continue;
    }
    if (start < from || start > nowMs) continue;
    if (e.event_type === "feed") feeds++;
    else if (e.event_type === "diaper") {
      const c = contentsOf(e);
      if (c === "pee" || c === "both") wet++;
      if (c === "poo" || c === "both") stools++;
    }
  }
  return { feeds, wet, stools, sleepSeconds: Math.round(sleepMs / 1000) };
}

/**
 * Awake since the last sleep ended, or asleep since the current one started.
 * "Last" is by when it ended, not when it started: a short nap logged after a
 * long one must not be skipped. Null when no sleep is in view.
 */
export function awakeState(
  events: LaneEvent[],
  kidId: string | null,
  nowMs: number
): { state: "awake" | "asleep"; since: string } | null {
  let lastEnd: string | null = null;
  let lastEndMs = -Infinity;
  for (const e of events) {
    if (e.event_type !== "sleep" || !forKid(e, kidId)) continue;
    if (e.ended_at === null) return { state: "asleep", since: e.started_at };
    const end = Date.parse(e.ended_at);
    if (Number.isFinite(end) && end <= nowMs && end > lastEndMs) {
      lastEndMs = end;
      lastEnd = e.ended_at;
    }
  }
  return lastEnd ? { state: "awake", since: lastEnd } : null;
}
