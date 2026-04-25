"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runBirthdaySkill } from "@/skills/family-birthday-social";
import type { Output as BirthdayOutput } from "@/skills/family-birthday-social";

async function getAuthedFamily() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const { data: membership, error } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !membership) throw new Error("no family found");
  return { supabase, userId: user.id, familyId: membership.family_id };
}

export async function createBirthdayEvent(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const kid_id = (formData.get("kid_id") as string)?.trim() || null;
    const party_date = (formData.get("party_date") as string)?.trim();
    const host_name = (formData.get("host_name") as string)?.trim() || null;
    const rsvp_status = (formData.get("rsvp_status") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!party_date) {
      return err("invalid_input", "Party date is required.", "party_date missing");
    }

    const { data, error } = await supabase
      .from("kid_birthday_events")
      .insert({ family_id: familyId, kid_id, party_date, host_name, rsvp_status, notes })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "createBirthdayEvent" } });
      return err("db_error", "Could not save birthday event.", error.message);
    }

    revalidatePath("/kids/birthdays");
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "createBirthdayEvent" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

// Fires skill ON DEMAND when user clicks "Suggest gift"
export async function getGiftSuggestions(
  event_id: string
): Promise<ActionResult<BirthdayOutput>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    const { data: event } = await supabase
      .from("kid_birthday_events")
      .select("*, kids(name, birth_date, food_favorites, food_aversions)")
      .eq("id", event_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!event) return err("not_found", "Event not found.", `event ${event_id} not in family`);

    const kid = event.kids as {
      name: string;
      birth_date: string | null;
      food_favorites: string[] | null;
      food_aversions: string[] | null;
    } | null;

    const kidAge = kid?.birth_date
      ? Math.floor(
          (new Date(event.party_date).getTime() - new Date(kid.birth_date).getTime()) /
            (1000 * 60 * 60 * 24 * 365.25)
        )
      : 5;

    // Get prior gifts for context
    const { data: priorEvents } = await supabase
      .from("kid_birthday_events")
      .select("party_date, host_name, gift_planned")
      .eq("family_id", familyId)
      .not("gift_planned", "is", null)
      .order("party_date", { ascending: false })
      .limit(10);

    const priorGiftsGiven = (priorEvents ?? [])
      .filter((e) => e.gift_planned && e.host_name)
      .map((e) => ({
        recipient: e.host_name!,
        gift: e.gift_planned!,
        date: e.party_date,
        price_usd: 25, // Default estimate since we don't store price
      }));

    const skillResult = await withRetry(() =>
      runBirthdaySkill(
        {
          kid: {
            name: kid?.name ?? "unknown",
            age: kidAge,
            food_favorites: kid?.food_favorites ?? [],
            food_aversions: kid?.food_aversions ?? [],
          },
          party_context: event.host_name ? "attending" : "hosting",
          host_name: event.host_name ?? undefined,
          party_date: event.party_date,
          prior_gifts_given: priorGiftsGiven,
          prior_gifts_received: [],
        },
        { familyId, userId }
      )
    );

    if (!skillResult.ok || !skillResult.data) {
      return err(
        "skill_error",
        "Could not generate suggestions. Please try again.",
        skillResult.error?.message ?? "skill failed"
      );
    }

    return ok(skillResult.data);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "getGiftSuggestions" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function recordGiftGiven(
  event_id: string,
  gift_text: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { error } = await supabase
      .from("kid_birthday_events")
      .update({ gift_planned: gift_text })
      .eq("id", event_id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "recordGiftGiven" } });
      return err("db_error", "Could not record gift.", error.message);
    }

    revalidatePath("/kids/birthdays");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "recordGiftGiven" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function updateRSVP(
  event_id: string,
  status: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { error } = await supabase
      .from("kid_birthday_events")
      .update({ rsvp_status: status })
      .eq("id", event_id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "updateRSVP" } });
      return err("db_error", "Could not update RSVP.", error.message);
    }

    revalidatePath("/kids/birthdays");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "updateRSVP" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
