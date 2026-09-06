import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { WeekPickerNav } from "@/components/ui/WeekPickerNav";
import { ShiftCard } from "@/components/caregiver/ShiftCard";
import { CaregiverList } from "@/components/caregiver/CaregiverList";
import { QuickBriefModal } from "@/components/caregiver/QuickBriefModal";
import { parseWeekParam, formatWeekParam, addDays, weekLabel } from "@/lib/week";
import { requireFamily } from "@/lib/auth/current-family";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function CaregiverHubPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;

  const supabase = await createClient();
  const { familyId } = await requireFamily();


  const today = new Date();
  const selectedWeek = parseWeekParam(weekParam ?? null, today);
  const weekStr = formatWeekParam(selectedWeek);
  // defaultPlanWeek jumps to next Monday from Friday onward, so on Fri/Sat/Sun
  // this page opens on a week that is not the one we are in. Saying "this week"
  // over it told you nothing was scheduled on days when something was.
  const shownWeek = weekLabel(selectedWeek, today);

  if (!weekParam) {
    redirect(`/caregiver?week=${weekStr}`);
  }

  // Week range for shift query (start_at UTC-range covers Mon 00:00 local → next Mon 00:00 local)
  const weekStartIso = selectedWeek.toISOString();
  const weekEndIso = addDays(selectedWeek, 7).toISOString();

  const [{ data: kids }, { data: caregivers }, { data: weekShifts }] =
    await Promise.all([
      supabase
        .from("kids")
        .select("id, name, birth_date, notes, food_favorites, food_aversions")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("caregivers")
        .select("id, name, role, email, phone, notes")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("caregiver_shifts")
        .select("id, start_at, end_at, kid_names, caregivers(name, role)")
        .eq("family_id", familyId)
        .gte("start_at", weekStartIso)
        .lt("start_at", weekEndIso)
        .order("start_at", { ascending: true }),
    ]);

  // Fetch brief/recap status for shifts this week
  const shiftIds = (weekShifts ?? []).map((s) => s.id);
  const [{ data: briefs }, { data: recaps }] = await Promise.all([
    shiftIds.length > 0
      ? supabase.from("shift_briefs").select("shift_id").in("shift_id", shiftIds)
      : Promise.resolve({ data: [] }),
    shiftIds.length > 0
      ? supabase.from("shift_recaps").select("shift_id").in("shift_id", shiftIds)
      : Promise.resolve({ data: [] }),
  ]);

  const briefSet = new Set((briefs ?? []).map((b) => b.shift_id));
  const recapSet = new Set((recaps ?? []).map((r) => r.shift_id));

  const shiftsWithStatus = (weekShifts ?? []).map((s) => ({
    ...s,
    caregivers: s.caregivers as { name: string; role: string } | null,
    hasBrief: briefSet.has(s.id),
    hasRecap: recapSet.has(s.id),
  }));

  const hasKids = (kids ?? []).length > 0;
  const hasCaregivers = (caregivers ?? []).length > 0;

  return (
    <main className="space-y-6">
      {/* Week picker */}
      <div className="bg-white rounded-xl border border-foreground/10 px-4 py-3">
        <WeekPickerNav maxWeeksForward={8} minWeeksBack={4} />
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Caregiver Hub</h1>
        {hasKids && hasCaregivers && (
          <QuickBriefModal
            caregivers={caregivers ?? []}
            kids={(kids ?? []).map((k) => ({ id: k.id, name: k.name }))}
          />
        )}
      </div>

      {/* No-kids empty state */}
      {!hasKids && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-center space-y-3">
          <p className="text-sm text-amber-800 font-medium">
            Add your child to get started
          </p>
          <p className="text-sm text-amber-700/70">
            Briefs and recaps are built around your child&apos;s profile.
          </p>
          <Link href="/caregiver/kids/new">
            <Button className="bg-amber-600 hover:bg-amber-700 text-white">
              Add a child
            </Button>
          </Link>
        </div>
      )}

      {/* Shifts section — week-scoped */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Shifts {shownWeek}</h2>
          {hasKids && hasCaregivers && (
            <Link href={`/caregiver/shifts/new?week=${weekStr}`}>
              <Button variant="outline">
                New shift
              </Button>
            </Link>
          )}
        </div>
        {shiftsWithStatus.length === 0 ? (
          <p className="text-sm text-foreground/40">
            {hasKids && hasCaregivers
              ? `No shifts scheduled for ${shownWeek}.`
              : "Add caregivers and kids first, then schedule shifts."}
          </p>
        ) : (
          <div className="space-y-2">
            {shiftsWithStatus.map((s) => (
              <ShiftCard key={s.id} shift={s} />
            ))}
          </div>
        )}
        {shiftsWithStatus.length > 0 && (
          <Link href="/caregiver/shifts" className="text-sm text-foreground/50 underline">
            View all shifts →
          </Link>
        )}
      </section>

      {/* Caregivers section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Caregivers</h2>
          <Link href="/caregiver/caregivers/new">
            <Button variant="outline">
              Add caregiver
            </Button>
          </Link>
        </div>
        <CaregiverList caregivers={caregivers ?? []} />
      </section>

      {/* Kids section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Kids</h2>
          <Link href="/caregiver/kids/new">
            <Button variant="outline">
              Add child
            </Button>
          </Link>
        </div>
        {(kids ?? []).length === 0 ? (
          <p className="text-sm text-foreground/40">No kids yet.</p>
        ) : (
          <div className="space-y-2">
            {(kids ?? []).map((k) => (
              <Link
                key={k.id}
                href={`/caregiver/kids/${k.id}`}
                className="flex items-start justify-between rounded-lg border border-foreground/10 p-4 hover:bg-foreground/5 transition"
              >
                <div>
                  <p className="font-medium">{k.name}</p>
                  {k.notes && (
                    <p className="text-sm text-foreground/50 mt-0.5 truncate max-w-xs">
                      {k.notes}
                    </p>
                  )}
                </div>
                <span className="text-xs text-foreground/30 mt-1">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
