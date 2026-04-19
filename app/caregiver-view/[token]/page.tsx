import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecapForm } from "@/components/caregiver/RecapForm";

interface Props {
  params: Promise<{ token: string }>;
}

// Public route — no auth required. Token = shift_id for MVP.
// POSTBUILD: Replace with HMAC-signed tokens.

export default async function CaregiverViewPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: shift } = await supabase
    .from("caregiver_shifts")
    .select("id, start_at, end_at, kid_names, caregivers(name, role)")
    .eq("id", token)
    .maybeSingle();

  if (!shift) notFound();

  const { data: brief } = await supabase
    .from("shift_briefs")
    .select("content, generated_at")
    .eq("shift_id", token)
    .maybeSingle();

  const { data: existingRecap } = await supabase
    .from("shift_recaps")
    .select("id, transcription, submitted_at")
    .eq("shift_id", token)
    .maybeSingle();

  const caregiverInfo = shift.caregivers as { name: string; role: string } | null;
  const kidNames = shift.kid_names ?? [];

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  return (
    <main className="min-h-screen bg-amber-50">
      <div className="mx-auto max-w-xl px-5 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          {caregiverInfo?.name && (
            <p className="text-2xl font-semibold">
              Good morning, {caregiverInfo.name}! 👋
            </p>
          )}
          <p className="text-base text-foreground/60">
            {formatTime(shift.start_at)} – {new Date(shift.end_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </p>
          {kidNames.length > 0 && (
            <p className="text-base text-foreground/70">
              Today you have {kidNames.join(" and ")}
            </p>
          )}
        </div>

        <hr className="border-amber-200" />

        {/* Brief content */}
        {brief ? (
          <div className="space-y-1">
            <div className="prose prose-sm max-w-none text-foreground/80 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_p]:text-lg [&_li]:text-lg [&_ul]:space-y-1">
              {/* Render markdown as pre for MVP — rich rendering is POSTBUILD */}
              <pre className="text-lg leading-relaxed whitespace-pre-wrap font-sans">
                {brief.content}
              </pre>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-100 p-5 text-center">
            <p className="text-amber-800">
              No brief has been generated yet. The family will share one soon!
            </p>
          </div>
        )}

        <hr className="border-amber-200" />

        {/* Recap section */}
        {existingRecap ? (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Your recap</h2>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
              <p className="text-lg text-foreground/80 whitespace-pre-wrap">
                {existingRecap.transcription}
              </p>
              <p className="text-sm text-foreground/40 mt-3">
                Submitted {new Date(existingRecap.submitted_at).toLocaleString()}
              </p>
            </div>
            <p className="text-base text-emerald-700 font-medium">
              ✓ The family can see your recap. Thank you!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">How did it go?</h2>
            <p className="text-base text-foreground/60">
              Let {kidNames.length > 0 ? kidNames[0] + "'s" : "the"} family know how the day went.
            </p>
            <RecapForm shiftId={token} />
          </div>
        )}
      </div>
    </main>
  );
}
