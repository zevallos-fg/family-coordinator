import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Shift {
  id: string;
  start_at: string;
  end_at: string;
  kid_names: string[] | null;
  caregivers: { name: string; role: string } | null;
  hasBrief: boolean;
  hasRecap: boolean;
}

const STATUS_COLORS = {
  recap: "bg-emerald-100 text-emerald-800",
  brief: "bg-amber-100 text-amber-800",
  pending: "bg-gray-100 text-gray-600",
};

function formatShiftTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ShiftCard({ shift }: { shift: Shift }) {
  const statusLabel = shift.hasRecap
    ? "Recap submitted"
    : shift.hasBrief
      ? "Brief ready"
      : "No brief yet";

  const statusColor = shift.hasRecap
    ? STATUS_COLORS.recap
    : shift.hasBrief
      ? STATUS_COLORS.brief
      : STATUS_COLORS.pending;

  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {shift.caregivers?.name ?? "Unknown caregiver"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          {shift.kid_names && shift.kid_names.length > 0 && (
            <p className="text-sm text-foreground/60 mt-0.5">
              {shift.kid_names.join(", ")}
            </p>
          )}
          <p className="text-xs text-foreground/40 mt-1">
            {formatShiftTime(shift.start_at)} → {formatShiftTime(shift.end_at)}
          </p>
        </div>
        <Link href={`/caregiver/shifts/${shift.id}`} className="shrink-0">
          <Button variant="outline">
            View
          </Button>
        </Link>
      </div>
    </div>
  );
}
