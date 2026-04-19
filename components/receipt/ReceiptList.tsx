import Link from "next/link";

interface ReceiptRow {
  id: string;
  purchased_at: string | null;
  total_cents: number | null;
  store_id: string | null;
  image_url: string;
  stores: { name: string } | null;
}

interface Props {
  receipts: ReceiptRow[];
}

export function ReceiptList({ receipts }: Props) {
  if (receipts.length === 0) {
    return (
      <div className="text-center py-16 text-stone-400">
        <div className="text-5xl mb-3">🧾</div>
        <p className="text-stone-500 font-medium">No receipts yet</p>
        <p className="text-sm mt-1">Add your first receipt to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {receipts.map((r) => (
        <Link
          key={r.id}
          href={`/receipts/${r.id}`}
          className="block bg-white border border-stone-100 rounded-2xl p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-stone-800">
                {r.stores?.name ?? "Unknown store"}
              </p>
              <p className="text-sm text-stone-400 mt-0.5">
                {r.purchased_at
                  ? new Date(r.purchased_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Date unknown"}
              </p>
            </div>
            <span className="text-amber-700 font-semibold">
              {r.total_cents != null
                ? `$${(r.total_cents / 100).toFixed(2)}`
                : "—"}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
