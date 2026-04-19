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

  const { data: family, error: familyErr } = await supabase
    .from("families")
    .insert({ name, city, timezone })
    .select("id")
    .single();

  if (familyErr || !family) {
    return { error: familyErr?.message ?? "Failed to create family." };
  }

  const { error: memberErr } = await supabase.from("family_members").insert({
    family_id: family.id,
    user_id: authData.user.id,
    role: "owner",
  });

  if (memberErr) {
    return { error: memberErr.message };
  }

  return { familyId: family.id };
}

export async function sendInvite(familyId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const email = (formData.get("email") as string).trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
