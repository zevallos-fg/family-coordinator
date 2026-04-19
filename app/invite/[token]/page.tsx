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

  // Check if user already belongs to this family
  const { data: existing } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .eq("family_id", invite.family_id)
    .maybeSingle();

  if (!existing) {
    await supabase.from("family_members").insert({
      family_id: invite.family_id,
      user_id: user.id,
      role: invite.role ?? "partner",
    });

    await supabase
      .from("family_invites")
      .update({ accepted_at: now.toISOString() })
      .eq("id", invite.id);
  }

  redirect("/dashboard");
}
