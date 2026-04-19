import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ShiftCard } from "@/components/caregiver/ShiftCard";
import { CaregiverList } from "@/components/caregiver/CaregiverList";
import { QuickBriefModal } from "@/components/caregiver/QuickBriefModal";

export default async function CaregiverHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const familyId = membership.family_id;

  const [{ data: kids }, { data: caregivers }, { data: recentShifts }] =
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
        .order("start_at", { ascending: false })
        .limit(10),
    ]);

  // Fetch brief/recap status for each shift
  const shiftIds = (recentShifts ?? []).map((s) => s.id);
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

  const shiftsWithStatus = (recentShifts ?? []).map((s) => ({
    ...s,
    caregivers: s.caregivers as { name: string; role: string } | null,
    hasBrief: briefSet.has(s.id),
    hasRecap: recapSet.has(s.id),
  }));

  const hasKids = (kids ?? []).length > 0;
  const hasCaregivers = (caregivers ?? []).length > 0;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
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

      {/* Shifts section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Shifts</h2>
          {hasKids && hasCaregivers && (
            <Link href="/caregiver/shifts/new">
              <Button variant="outline">
                New shift
              </Button>
            </Link>
          )}
        </div>
        {shiftsWithStatus.length === 0 ? (
          <p className="text-sm text-foreground/40">
            {hasKids && hasCaregivers
              ? "No shifts yet. Schedule one to generate a brief."
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
