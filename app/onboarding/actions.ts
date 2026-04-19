"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function createFamily(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const name = (formData.get("name") as string).trim();
  const city = (formData.get("city") as string | null)?.trim() || null;
  const timezone =
    (formData.get("timezone") as string) || "America/New_York";

  if (!name) return { error: "Family name is required." };

  const { data: familyId, error } = await supabase.rpc(
    "fn_create_family_and_claim",
    { p_name: name, p_city: city ?? undefined, p_timezone: timezone }
  );

  if (error || !familyId) {
    return { error: error?.message ?? "Failed to create family." };
  }

  return { familyId };
}

export async function sendInvite(familyId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const email = (formData.get("email") as string).trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase.from("family_invites").insert({
    family_id: familyId,
    email,
    token,
    role: "partner",
    expires_at: expiresAt,
  });

  if (error) return { error: error.message };
  return { token };
}

export async function acceptInvite(token: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const { data: familyId, error } = await supabase.rpc("fn_accept_invite", {
    p_token: token,
  });

  if (error || !familyId) {
    return {
      error:
        error?.message ?? "Invite not found, already accepted, or expired.",
    };
  }

  return { familyId };
}