import { DutyBadge } from "./DutyBadge";

interface DutyRow {
  id: string;
  date: string;
  duty_type: string;
  notes: string | null;
}

interface WeekViewProps {
  duties: DutyRow[];
}

function groupByDate(duties: DutyRow[]) {
  const map = new Map<string, DutyRow[]>();
  for (const d of duties) {
    const existing = map.get(d.date) ?? [];
    existing.push(d);
    map.set(d.date, existing);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, rows }));
}

function formatDate(isoDate: string) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function WeekView({ duties }: WeekViewProps) {
  const grouped = groupByDate(duties);

  if (grouped.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400">
        <p className="text-sm">No schedule for this week yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ date, rows }) => (
        <div key={date} className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="font-medium text-stone-700 mb-3 text-sm">
            {formatDate(date)}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {["dropoff", "pickup", "nap"].map((type) => {
              const row = rows.find((r) => r.duty_type === type);
              if (!row) return null;
              return (
                <DutyBadge
                  key={type}
                  type={type as "dropoff" | "pickup" | "nap"}
                  assignee={row.notes ?? "—"}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
