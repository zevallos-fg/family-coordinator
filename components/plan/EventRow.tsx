import Link from "next/link";
import { formatWhen, relativeDay } from "@/lib/plan/events";

export type EventSummary = {
  id: string;
  title: string;
  kind: string;
  starts_at: string;
  location: string | null;
  with_whom: string | null;
  status: string;
  kid: string | null;
  progress: { done: number; total: number } | null;
};

const KIND_TONE: Record<string, string> = {
  medical: "text-sky-600",
  school: "text-violet-600",
};

/** One event in a list: when, who, and how far along the prep is. */
export function EventRow({ event, timeZone }: { event: EventSummary; timeZone: string }) {
  const where = [event.with_whom, event.location].filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`/plan/${event.id}`}
        data-testid={`event-${event.id}`}
        className="block rounded-xl border border-stone-200 bg-white px-3.5 py-3 active:bg-stone-100"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-stone-800">
            {event.kid && <span className={KIND_TONE[event.kind] ?? "text-amber-600"}>{event.kid} · </span>}
            {event.title}
          </span>
          <span className="shrink-0 text-[11px] text-stone-500">
            {event.status === "cancelled" ? "cancelled" : relativeDay(event.starts_at, new Date(), timeZone)}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-stone-500">
          {formatWhen(event.starts_at, timeZone)}
          {where ? ` · ${where}` : ""}
        </span>
        {event.progress && event.progress.total > 0 && (
          <span className="mt-1.5 flex items-center gap-2 text-[11px] text-stone-500">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
              <span
                className="block h-full rounded-full bg-violet-600"
                style={{ width: `${Math.round((event.progress.done / event.progress.total) * 100)}%` }}
              />
            </span>
            prep {event.progress.done}/{event.progress.total}
          </span>
        )}
      </Link>
    </li>
  );
}
