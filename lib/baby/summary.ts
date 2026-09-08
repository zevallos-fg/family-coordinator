import { formatDuration } from "./format";
import { SIDE_LABEL, segmentsOf, lastSideOf, suggestedSide, type FeedPayload } from "./nursing";

/**
 * The one line that says what an event actually was.
 *
 * The dashboard is a dashboard, not a menu: "Feeding · 47m ago" answers nothing
 * a parent asks at 4am. "(L) 10m, (R*) 13m" answers all of it — how long, which
 * sides, and where to start next. Same string is reused in the recent lists, so
 * a row reads identically wherever it appears.
 *
 * Pure and payload-shaped rather than component-shaped, so it can be unit tested
 * without rendering anything.
 */

export type Payload = Record<string, unknown>;

function str(p: Payload, key: string): string | null {
  const v = p[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(p: Payload, key: string): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Nursing: per-side totals in the order they happened, with a star on the side
 * to start next. Bottles say their volume instead.
 */
export function feedSummary(payload: Payload, opts?: { markNextSide?: boolean }): string | null {
  const p = payload as FeedPayload;

  if (p.method === "bottle" || typeof p.volume_ml === "number") {
    const ml = num(payload, "volume_ml");
    const contents = str(payload, "contents");
    if (ml === null) return contents;
    return contents ? `${ml} ml · ${contents}` : `${ml} ml`;
  }

  const segments = segmentsOf(p);
  if (segments.length === 0) return null;

  // Which side the NEXT feed should start on — the opposite of the one this
  // session ended on. Starred rather than spelled out because the card is one
  // line and the star is the thing the eye is looking for.
  const next = opts?.markNextSide ? suggestedSide(lastSideOf(p)) : null;

  // Two spells on the same side really were two spells, but a card has no room
  // for that, so totals are summed per side while the ORDER is preserved by
  // first appearance.
  const order: Array<"L" | "R"> = [];
  const totals: Record<string, number> = {};
  for (const s of segments) {
    if (!(s.side in totals)) {
      totals[s.side] = 0;
      order.push(s.side);
    }
    totals[s.side] += s.seconds;
  }

  return order
    .map((side) => {
      const star = side === next ? "*" : "";
      return `(${side}${star}) ${formatDuration(totals[side])}`;
    })
    .join(", ");
}

/** Diaper: "Pee, large" or "Both · pee large, poo medium · loose". */
export function diaperSummary(payload: Payload): string | null {
  const contents = str(payload, "contents");
  if (!contents) return null;

  const label = contents === "both" ? "Both" : contents[0].toUpperCase() + contents.slice(1);
  const pee = str(payload, "pee_amount");
  const poo = str(payload, "poo_amount");
  const consistency = str(payload, "consistency");

  const parts: string[] = [];
  if (contents === "both") {
    // Both carries two amounts, and saying which is which is the whole point.
    const amounts = [pee && `pee ${pee}`, poo && `poo ${poo}`].filter(Boolean);
    if (amounts.length) parts.push(amounts.join(", "));
  } else {
    const amount = contents === "poo" ? poo : pee;
    if (amount) parts.push(amount);
  }
  if (consistency) parts.push(consistency);

  return parts.length ? `${label}, ${parts.join(" · ")}` : label;
}

export function growthSummary(payload: Payload): string | null {
  const bits = [
    num(payload, "weight_kg") !== null && `${num(payload, "weight_kg")} kg`,
    num(payload, "height_cm") !== null && `${num(payload, "height_cm")} cm`,
    num(payload, "head_cm") !== null && `head ${num(payload, "head_cm")} cm`,
  ].filter(Boolean) as string[];
  return bits.length ? bits.join(" · ") : null;
}

/**
 * The salient detail for any event type, or null when there is nothing to say.
 *
 * Null rather than an empty string: the caller decides whether an absent detail
 * means "show nothing" or "no entries yet", and those are different sentences.
 */
export function eventSummary(
  eventType: string,
  payload: Payload | null | undefined,
  opts?: { markNextSide?: boolean }
): string | null {
  const p = payload ?? {};
  switch (eventType) {
    case "feed":
      return feedSummary(p, opts);
    case "diaper":
      return diaperSummary(p);
    case "growth":
      return growthSummary(p);
    case "sleep":
      return str(p, "location");
    case "pump": {
      const side = str(p, "side");
      const ml = num(p, "volume_ml");
      return [side && SIDE_LABEL[side as "L" | "R"] ? SIDE_LABEL[side as "L" | "R"] : side, ml && `${ml} ml`]
        .filter(Boolean)
        .join(" · ") || null;
    }
    default:
      return null;
  }
}

/** Duration of a finished event; null while it is still running. */
export function eventDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  return formatDuration(seconds);
}

/** The today strip: what a parent is asked for at a handover or an appointment. */
export function todayTotals(
  events: Array<{ event_type: string; started_at: string; ended_at: string | null }>,
  now: number = Date.now()
): { feeds: number; diapers: number; sleepSeconds: number } {
  let feeds = 0;
  let diapers = 0;
  let sleepSeconds = 0;
  for (const e of events) {
    if (e.event_type === "feed") feeds++;
    else if (e.event_type === "diaper") diapers++;
    else if (e.event_type === "sleep") {
      // A sleep still running counts up to now, or the total silently omits the
      // nap currently happening — which is the one the person is asking about.
      const end = e.ended_at ? Date.parse(e.ended_at) : now;
      sleepSeconds += Math.max(0, Math.round((end - Date.parse(e.started_at)) / 1000));
    }
  }
  return { feeds, diapers, sleepSeconds };
}
