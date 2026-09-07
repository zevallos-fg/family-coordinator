import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  // Look up the invite
  const { data: invite } = await supabase
    .from("family_invites")
    .select("id, family_id, role, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  const now = new Date();
  const isExpired = invite ? new Date(invite.expires_at) < now : false;
  const isAccepted = invite ? invite.accepted_at !== null : false;

  if (!invite || isExpired || isAccepted) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Invite invalid</h1>
          <p className="text-foreground/60">
            This invite link is invalid or has expired. Ask your family member
            to send a new one.
          </p>
        </div>
      </main>
    );
  }

  // Check if user already belongs to this family.
  //
  // Third appearance of the same defect. A dropped error here reads as "not a
  // member", and the next line inserts a membership row — so a blink of the
  // database gives someone who is already in the household a duplicate
  // family_members row. Every page picks the first family joined, so the
  // duplicate is invisible until it isn't.
  const { data: existing, error: existingError } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .eq("family_id", invite.family_id)
    .maybeSingle();

  if (existingError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">We couldn&apos;t check your invite</h1>
          <p className="mt-2 text-foreground/60">
            Nothing has changed. Open the link again in a moment.
          </p>
        </div>
      </main>
    );
  }

  if (!existing) {
    const { error: joinError } = await supabase.from("family_members").insert({
      family_id: invite.family_id,
      user_id: user.id,
      role: invite.role ?? "partner",
    });

    // Without this check a failed join still redirected to /dashboard, which
    // bounces to /onboarding for want of a membership — so the invite looked
    // like it had worked and then quietly asked you to start a second family.
    if (joinError) {
      return (
        <main className="flex min-h-full flex-col items-center justify-center p-8">
          <div className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-semibold">Couldn&apos;t join that family</h1>
            <p className="text-foreground/60">
              Something went wrong accepting the invite. The link is still valid —
              try opening it again, or ask for a new one.
            </p>
          </div>
        </main>
      );
    }

    // Marking the invite accepted is bookkeeping: the membership already exists,
    // so a failure here must not block the person who just joined.
    const { error: acceptError } = await supabase
      .from("family_invites")
      .update({ accepted_at: now.toISOString() })
      .eq("id", invite.id);

    if (acceptError) {
      console.error("[invite] could not mark invite accepted", {
        inviteId: invite.id,
        error: acceptError.message,
      });
    }
  }

  redirect("/dashboard");
}
