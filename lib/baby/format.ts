/**
 * Number formatting for the baby lane.
 *
 * Everything here turns seconds into characters. Nothing here decides what the
 * numbers mean — no thresholds, no "time to go in", no 5-1-1. That judgment is
 * the clinician's, and the share link is how they get the data.
 */

/** Stopwatch face: M:SS under an hour, H:MM:SS above it. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** Prose-ish duration for lists: "45s", "4m 12s", "1h 03m". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(s % 60).padStart(2, "0")}s`;
}

/** "How long ago", for a tile that shows the last event of its kind. */
export function formatAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "just now";
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** 3:04 pm — lower case, because it sits in small grey type. */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
}

/** Seconds between two ISO timestamps, or null if either is missing. */
export function secondsBetween(
  fromIso: string | null | undefined,
  toMs: number
): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return null;
  return Math.max(0, Math.floor((toMs - from) / 1000));
}
