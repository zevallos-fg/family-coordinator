import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { HurricaneChecklist } from "@/components/hurricane/HurricaneChecklist";
import { isChecklistSettled } from "@/lib/db/enums";
import { requireFamily } from "@/lib/auth/current-family";

const HURRICANE_SEASON = "hurricane_2026";

async function getHurricaneData() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: items, error } = await supabase
    .from("seasonal_checklists")
    .select("id, item_text, status, due_by_date, season")
    .eq("family_id", familyId)
    .like("season", `${HURRICANE_SEASON}%`)
    .order("due_by_date", { ascending: true });

  return { items: items ?? [], error: error?.message ?? null };
}

function getSeasonPhaseLabel(phase: string | null): string {
  switch (phase) {
    case "pre_season": return "Pre-Season (Jan–May)";
    case "active_season": return "Active Season (Jun–Nov)";
    case "imminent": return "Imminent Threat";
    case "post_season": return "Post-Season (Dec)";
    default: return "Hurricane Season";
  }
}

export default async function HurricanePage() {
  const { items, error } = await getHurricaneData();

  const seasonPhase = items[0]?.season.replace(`${HURRICANE_SEASON}_`, "") ?? null;
  const done = items.filter((i) => isChecklistSettled(i.status));
  const critical = items.filter((i) => i.item_text.includes("[CRITICAL]"));
  const criticalDone = critical.filter((i) => isChecklistSettled(i.status));
  const overallPct = items.length > 0 ? Math.round((done.length / items.length) * 100) : 0;
  const criticalPct = critical.length > 0 ? Math.round((criticalDone.length / critical.length) * 100) : 100;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Hurricane Prep</h1>
        <p className="text-sm text-stone-400 mt-1">
          Miami, FL — {getSeasonPhaseLabel(seasonPhase)}
        </p>
      </div>

      {error && <ErrorBanner userMessage="Could not load checklist. Please refresh." />}

      {!error && items.length === 0 && (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          }
          title="No checklist generated yet"
          description="Generate your personalized hurricane prep checklist for the 2026 season."
          action={<HurricaneChecklist items={[]} showGenerateButton />}
        />
      )}

      {!error && items.length > 0 && (
        <>
          {/* Progress bars */}
          <div className="p-4 border border-stone-200 rounded-xl space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-stone-600">Critical Items</span>
                <span className="text-xs text-stone-500">{criticalDone.length}/{critical.length} ({criticalPct}%)</span>
              </div>
              <div className="w-full h-2 bg-stone-200 rounded-full">
                <div
                  className="h-2 bg-red-500 rounded-full transition-all"
                  style={{ width: `${criticalPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-stone-600">Overall Progress</span>
                <span className="text-xs text-stone-500">{done.length}/{items.length} ({overallPct}%)</span>
              </div>
              <div className="w-full h-2 bg-stone-200 rounded-full">
                <div
                  className="h-2 bg-amber-500 rounded-full transition-all"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          </div>

          <HurricaneChecklist items={items} showGenerateButton={false} />
        </>
      )}
    </main>
  );
}
