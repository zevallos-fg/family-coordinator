"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertMembership } from "@/lib/auth/current-family";

export async function updateDefaultServes(
  familyId: string,
  defaultServes: number
): Promise<{ error?: string }> {
  if (defaultServes < 1 || defaultServes > 20) {
    return { error: "Default serves must be between 1 and 20" };
  }

  const supabase = await createClient();

  // Verify the user belongs to this family. Failing closed was already the
  // behaviour and stays; what changes is that a check we could not run no
  // longer claims the family does not exist.
  const access = await assertMembership(familyId);
  if (!access.ok) return { error: access.error };

  const { error } = await supabase
    .from("families")
    .update({ default_serves: defaultServes })
    .eq("id", familyId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/meal-plans");
  return {};
}
