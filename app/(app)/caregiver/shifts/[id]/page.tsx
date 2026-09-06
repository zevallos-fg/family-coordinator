import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BriefPreview } from "@/components/caregiver/BriefPreview";
import { Button } from "@/components/ui/button";
import { deleteShift } from "@/app/(app)/caregiver/actions";
import { requireFamily } from "@/lib/auth/current-family";

interface Props {
  params: Promise<{ id: string }>;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function ShiftDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: shift } = await supabase
    .from("caregiver_shifts")
    .select("*, caregivers(name, role)")
    .eq("id", id)
    .eq("family_id", familyId)
    .single();

  if (!shift) notFound();

  const [{ data: brief }, { data: recap }] = await Promise.all([
    supabase
      .from("shift_briefs")
      .select("content, generated_at")
      .eq("shift_id", id)
      .maybeSingle(),
    supabase
      .from("shift_recaps")
      .select("transcription, structured_log, submitted_at")
      .eq("shift_id", id)
      .maybeSingle(),
  ]);

  const caregiverInfo = shift.caregivers as { name: string; role: string } | null;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <Link href="/caregiver/shifts" className="text-sm text-foreground/40 hover:text-foreground/60">
          ← Shifts
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          {caregiverInfo?.name ?? "Shift"} · {new Date(shift.start_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </h1>
      </div>

      {/* Shift info */}
      <div className="rounded-lg border border-foreground/10 p-4 space-y-1">
        <p className="text-sm text-foreground/60">
          <span className="font-medium text-foreground">Start:</span>{" "}
          {formatDateTime(shift.start_at)}
        </p>
        <p className="text-sm text-foreground/60">
          <span className="font-medium text-foreground">End:</span>{" "}
          {formatDateTime(shift.end_at)}
        </p>
        {(shift.kid_names ?? []).length > 0 && (
          <p className="text-sm text-foreground/60">
            <span className="font-medium text-foreground">Kids:</span>{" "}
            {shift.kid_names!.join(", ")}
          </p>
        )}
        {caregiverInfo?.role && (
          <p className="text-sm text-foreground/60">
            <span className="font-medium text-foreground">Role:</span>{" "}
            {caregiverInfo.role}
          </p>
        )}
      </div>

      {/* Brief + recap */}
      <BriefPreview
        shiftId={id}
        brief={brief ?? null}
        recap={recap ? { ...recap, structured_log: recap.structured_log as object | null } : null}
      />

      {/* Danger zone */}
      <form
        action={async () => {
          "use server";
          await deleteShift(id);
          redirect("/caregiver/shifts");
        }}
        className="pt-4"
      >
        <Button type="submit" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
          Delete shift
        </Button>
      </form>
    </main>
  );
}
