import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ShiftCard } from "@/components/caregiver/ShiftCard";

export default async function ShiftsPage() {
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

  const { data: shifts } = await supabase
    .from("caregiver_shifts")
    .select("id, start_at, end_at, kid_names, caregivers(name, role)")
    .eq("family_id", membership.family_id)
    .order("start_at", { ascending: false })
    .limit(50);

  const shiftIds = (shifts ?? []).map((s) => s.id);
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

  const shiftsWithStatus = (shifts ?? []).map((s) => ({
    ...s,
    caregivers: s.caregivers as { name: string; role: string } | null,
    hasBrief: briefSet.has(s.id),
    hasRecap: recapSet.has(s.id),
  }));

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/caregiver" className="text-sm text-foreground/40 hover:text-foreground/60">
            ← Caregiver Hub
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Shifts</h1>
        </div>
        <Link href="/caregiver/shifts/new">
          <Button>New shift</Button>
        </Link>
      </div>

      {shiftsWithStatus.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/20 p-8 text-center">
          <p className="text-foreground/50 text-sm">No shifts yet.</p>
          <Link href="/caregiver/shifts/new">
            <Button className="mt-3">
              Schedule your first shift
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {shiftsWithStatus.map((s) => (
            <ShiftCard key={s.id} shift={s} />
          ))}
        </div>
      )}
    </main>
  );
}
