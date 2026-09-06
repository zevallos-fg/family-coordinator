import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CategoryColumn } from "@/components/organized/CategoryColumn";
import { requireFamily } from "@/lib/auth/current-family";

export default async function OrganizedPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();


  const [{ data: categories }, { data: captures }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, icon, urgent")
      .eq("family_id", familyId)
      .order("sort_order"),
    supabase
      .from("captures")
      .select("id, text, created_at, voice_transcription, category_id")
      .eq("family_id", familyId)
      .is("completed_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const cats = categories ?? [];
  const caps = captures ?? [];

  const uncategorized = caps.filter((c) => !c.category_id);
  const byCat = cats.map((cat) => ({
    category: cat,
    captures: caps.filter((c) => c.category_id === cat.id),
  }));

  const total = caps.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Organized</h1>
          <p className="text-sm text-stone-400 mt-0.5">
            {total} pending {total !== 1 ? "items" : "item"}
          </p>
        </div>
        <Link
          href="/capture/new"
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          + Capture
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-center py-12 text-stone-400 bg-white rounded-xl border border-stone-200">
          <p className="text-sm font-medium text-stone-500">All clear!</p>
          <p className="text-xs mt-1">Nothing pending to organize.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {byCat
            .filter(({ captures: cs }) => cs.length > 0)
            .sort((a, b) => {
              if (a.category.urgent && !b.category.urgent) return -1;
              if (!a.category.urgent && b.category.urgent) return 1;
              return 0;
            })
            .map(({ category, captures: cs }) => (
              <CategoryColumn
                key={category.id}
                category={category}
                captures={cs}
                allCategories={cats}
              />
            ))}

          {uncategorized.length > 0 && (
            <CategoryColumn
              category={{ id: "uncategorized", name: "Uncategorized", icon: "📌", urgent: false }}
              captures={uncategorized}
              allCategories={cats}
            />
          )}
        </div>
      )}
    </div>
  );
}
