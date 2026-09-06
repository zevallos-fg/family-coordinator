import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChoreRow } from "@/components/now/ChoreRow";
import { BabyButton } from "@/components/baby/BabyButton";
import { requireFamily } from "@/lib/auth/current-family";

export const dynamic = "force-dynamic";

type DueRow = {
  kind: string;
  source_id: string;
  item: string;
  detail: string | null;
  due_on: string;
  owner_user_id: string | null;
  recurring: boolean;
  source_table: string;
  days_until: number;
  bucket: string;
};

const BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  ahead: "Ahead",
};
const BUCKET_ORDER = ["overdue", "today", "this_week", "ahead"];

function initials(name: string | null | undefined) {
  if (!name) return null;
  return name.trim().charAt(0).toUpperCase();
}

export default async function NowPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();


  const [dueRes, groceryRes, peopleRes] = await Promise.all([
    supabase
      .from("v_whats_due")
      .select("*")
      .eq("family_id", familyId)
      .order("due_on", { ascending: true }),
    supabase
      .from("grocery_items")
      .select("id, store_id, stores(name)")
      .eq("family_id", familyId)
      .is("completed_at", null),
    supabase.from("users").select("id, full_name"),
  ]);

  const due = (dueRes.data ?? []) as unknown as DueRow[];
  const names = new Map(
    (peopleRes.data ?? []).map((u) => [u.id, u.full_name as string | null])
  );

  // Group open grocery items by store so "To buy" answers "where", not just "how many".
  const byStore = new Map<string, number>();
  for (const g of groceryRes.data ?? []) {
    const store =
      (g as unknown as { stores: { name: string } | null }).stores?.name ??
      "Unassigned";
    byStore.set(store, (byStore.get(store) ?? 0) + 1);
  }
  const stores = [...byStore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const buckets = BUCKET_ORDER.map((b) => ({
    key: b,
    label: BUCKET_LABEL[b],
    rows: due.filter((d) => d.bucket === b),
  })).filter((b) => b.rows.length > 0);

  const nothingAtAll = buckets.length === 0 && stores.length === 0;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="pb-4">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-stone-800">Now</h1>
        <p className="text-xs text-stone-400 mt-0.5">{today}</p>
      </div>

      {/* Above the fold, before anything that can be scrolled past: during labour
          the contraction timer is the only thing on this screen that matters. */}
      <BabyButton familyId={familyId} />

      {nothingAtAll && (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center">
          <p className="text-sm text-stone-600">Nothing needs you right now.</p>
          <Link
            href="/capture"
            className="mt-3 inline-block text-sm text-amber-700 underline underline-offset-4"
          >
            Capture something
          </Link>
        </div>
      )}

      {buckets.map((bucket) => (
        <section key={bucket.key} className="mb-6">
          <h2 className="text-xs text-stone-400 mb-2">{bucket.label}</h2>
          <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
            {bucket.rows.map((row) => (
              <ChoreRow
                key={`${row.source_table}-${row.source_id}`}
                id={row.source_id}
                sourceTable={row.source_table}
                item={row.item}
                detail={row.detail}
                recurring={row.recurring}
                daysUntil={row.days_until}
                owner={initials(names.get(row.owner_user_id ?? ""))}
              />
            ))}
          </div>
        </section>
      ))}

      {stores.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs text-stone-400 mb-2">To buy</h2>
          <Link href="/grocery" className="grid grid-cols-2 gap-2">
            {stores.map(([name, count]) => (
              <div key={name} className="rounded-lg bg-stone-100 px-3 py-2.5">
                <div className="text-xl font-medium text-stone-800">{count}</div>
                <div className="text-xs text-stone-500 truncate">{name}</div>
              </div>
            ))}
          </Link>
        </section>
      )}
    </div>
  );
}
