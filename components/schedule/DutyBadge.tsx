interface DutyBadgeProps {
  type: "dropoff" | "pickup" | "nap";
  assignee: string;
}

const LABELS: Record<string, string> = {
  dropoff: "Drop-off",
  pickup: "Pick-up",
  nap: "Nap",
};

export function DutyBadge({ type, assignee }: DutyBadgeProps) {
  const isDiscuss = assignee === "DISCUSS";
  return (
    <div
      className={`rounded-lg p-3 text-center border ${
        isDiscuss
          ? "border-rose-200 bg-rose-50"
          : "border-stone-200 bg-stone-50"
      }`}
    >
      <p className="text-xs text-stone-500 mb-0.5">{LABELS[type] ?? type}</p>
      <p
        className={`text-sm font-semibold ${
          isDiscuss ? "text-rose-600" : "text-stone-800"
        }`}
      >
        {assignee}
      </p>
    </div>
  );
}
