import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChoreRow } from "@/components/now/ChoreRow";
import { BabyButton } from "@/components/baby/BabyButton";
import { AddItem } from "@/components/now/AddItem";
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


  const [dueRes, groceryRes, peopleRes, anytimeRes] = await Promise.all([
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
    // Open items with no date: v_whats_due only carries dated ones, so these
    // would otherwise never appear anywhere.
    supabase
      .from("tasks")
      .select("id, title, description, owner_user_id")
      .eq("family_id", familyId)
      .in("status", ["open", "in_progress"])
      .is("due_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const anytime = (anytimeRes.data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    owner_user_id: string | null;
  }>;

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

  const nothingAtAll = buckets.length === 0 && stores.length === 0 && anytime.length === 0;
  const people = (peopleRes.data ?? []).map((u) => ({
    id: u.id as string,
    name: ((u.full_name as string | null) ?? "").split(" ")[0] || "Someone",
  }));

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

      <AddItem familyId={familyId} people={people} />

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

      {anytime.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs text-stone-400 mb-2">Anytime</h2>
          <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
            {anytime.map((t) => (
              <ChoreRow
                key={`tasks-${t.id}`}
                id={t.id}
                sourceTable="tasks"
                item={t.title}
                detail={t.description}
                recurring={false}
                daysUntil={null}
                owner={initials(names.get(t.owner_user_id ?? ""))}
              />
            ))}
          </div>
        </section>
      )}

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
