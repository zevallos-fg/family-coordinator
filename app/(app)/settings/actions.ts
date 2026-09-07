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

/**
 * When this family's day rolls over.
 *
 * 23% of this household's recorded sleeps cross midnight, so a midnight boundary
 * files last night's sleep under yesterday and leaves "last sleep" blank at the
 * exact moment someone picks up the phone to check it. Huckleberry exposes the
 * same control for the same reason.
 */
export async function updateDayStartTime(
  familyId: string,
  dayStartTime: string
): Promise<{ error?: string }> {
  // HH:MM, 24-hour. Anything else is a bug in the caller, not a user mistake.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dayStartTime)) {
    return { error: "Day start must be a time like 07:00" };
  }

  const access = await assertMembership(familyId);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .update({ day_start_time: dayStartTime })
    .eq("id", familyId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/now");
  return {};
}
