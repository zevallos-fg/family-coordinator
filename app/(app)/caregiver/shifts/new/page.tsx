import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShiftForm } from "@/components/caregiver/ShiftForm";
import { parseWeekParam, formatWeekParam, addDays } from "@/lib/week";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function NewShiftPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;

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

  const [{ data: caregivers }, { data: kids }] = await Promise.all([
    supabase
      .from("caregivers")
      .select("id, name, role")
      .eq("family_id", membership.family_id)
      .order("created_at"),
    supabase
      .from("kids")
      .select("id, name")
      .eq("family_id", membership.family_id)
      .order("created_at"),
  ]);

  // Compute default start time based on selected week
  const today = new Date();
  const selectedWeek = parseWeekParam(weekParam ?? null, today);
  const weekStr = formatWeekParam(selectedWeek);
  const weekEndDate = addDays(selectedWeek, 6);

  // If today falls within the selected week → use today at 08:00 local
  // Otherwise → use Monday of selected week at 08:00 local
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isCurrentWeek =
    todayMidnight >= selectedWeek && todayMidnight <= weekEndDate;

  const defaultDateBase = isCurrentWeek ? today : selectedWeek;
  const defaultStartAt = new Date(
    defaultDateBase.getFullYear(),
    defaultDateBase.getMonth(),
    defaultDateBase.getDate(),
    8, // 08:00 local
    0
  );

  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div>
        <Link href={`/caregiver?week=${weekStr}`} className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Caregiver Hub
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New shift</h1>
      </div>
      <ShiftForm
        caregivers={caregivers ?? []}
        kids={(kids ?? []).map((k) => ({ id: k.id, name: k.name }))}
        defaultStartAt={defaultStartAt}
      />
    </main>
  );
}
