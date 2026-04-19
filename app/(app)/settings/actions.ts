"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateDefaultServes(
  familyId: string,
  defaultServes: number
): Promise<{ error?: string }> {
  if (defaultServes < 1 || defaultServes > 20) {
    return { error: "Default serves must be between 1 and 20" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Verify the user belongs to this family
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .eq("family_id", familyId)
    .maybeSingle();
  if (!membership) return { error: "Family not found" };

  const { error } = await supabase
    .from("families")
    .update({ default_serves: defaultServes })
    .eq("id", familyId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/meal-plans");
  return {};
}
