import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RecapForm } from "@/components/caregiver/RecapForm";
import { shareRpc } from "@/lib/caregiver-share";

interface Props {
  params: Promise<{ token: string }>;
}

// A link handed to a caregiver is short-lived and personal. It should never end
// up in an index, a preview card, or a cached copy.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated, and outside the (app) route group.
 *
 * This page used to look the shift up by `id = token` — a raw row id used as a
 * credential, which never expires and cannot be revoked. It also never worked:
 * every policy on caregiver_shifts, shift_briefs and shift_recaps requires
 * fn_user_in_family(...), and this page uses the anon client, so a caregiver
 * opening the link got a 404 and the recap form could not save.
 *
 * Now it is one call to fn_share_read_shift, which is SECURITY DEFINER and takes
 * the token as its only argument. RLS is untouched; the function is the only
 * door.
 */
export default async function CaregiverViewPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await shareRpc(supabase).rpc("fn_share_read_shift", {
    p_token: token,
  });

  const shift = data?.[0];

  if (error || !shift) {
    // Not-found, expired and revoked all render the same sentence, because the
    // function deliberately cannot tell them apart either.
    return (
      <main className="flex min-h-screen items-center justify-center bg-amber-50 px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-foreground">
            This link isn&apos;t available
          </h1>
          <p className="mt-2 text-base text-foreground/60">
            It may have expired or been turned off. Ask the family for a new one.
          </p>
        </div>
      </main>
    );
  }

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
        <div className="space-y-1">
          <p className="text-2xl font-semibold">
            Good morning, {shift.caregiver_name}! 👋
          </p>
          <p className="text-base text-foreground/60">
            {formatTime(shift.start_at)} –{" "}
            {new Date(shift.end_at).toLocaleString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </p>
          {kidNames.length > 0 && (
            <p className="text-base text-foreground/70">
              Today you have {kidNames.join(" and ")}
            </p>
          )}
        </div>

        <hr className="border-amber-200" />

        {shift.brief_content ? (
          <div className="space-y-1">
            <div className="prose prose-sm max-w-none text-foreground/80">
              <pre className="text-lg leading-relaxed whitespace-pre-wrap font-sans">
                {shift.brief_content}
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

        {shift.recap_transcription ? (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Your recap</h2>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
              <p className="text-lg text-foreground/80 whitespace-pre-wrap">
                {shift.recap_transcription}
              </p>
              {shift.recap_submitted_at && (
                <p className="text-sm text-foreground/40 mt-3">
                  Submitted {new Date(shift.recap_submitted_at).toLocaleString()}
                </p>
              )}
            </div>
            <p className="text-base text-emerald-700 font-medium">
              ✓ The family can see your recap. Thank you!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">How did it go?</h2>
            <p className="text-base text-foreground/60">
              Let {kidNames.length > 0 ? kidNames[0] + "'s" : "the"} family know how
              the day went.
            </p>
            <RecapForm token={token} />
          </div>
        )}
      </div>
    </main>
  );
}
