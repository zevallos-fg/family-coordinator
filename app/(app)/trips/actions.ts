"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import type { Database } from "@/lib/supabase/database.types";
import { run as runTravelSkill } from "@/skills/family-travel";
import { lookupFamily } from "@/lib/auth/current-family";

async function getAuthedFamily() {
  const supabase = await createClient();
  const family = await lookupFamily();

  // Three failures, three sentences. The old body collapsed `error || !membership`
  // into "no family found", so a database that could not be reached reported
  // itself as a household that does not exist.
  if (!family.ok) {
    if (family.reason === "unauthenticated") throw new Error("not signed in");
    if (family.reason === "no-family") throw new Error("no family found");
    throw new Error(`could not reach your family record: ${family.message}`);
  }

  return { supabase, userId: family.userId, familyId: family.familyId };
}

export async function createTrip(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    const destination = (formData.get("destination") as string)?.trim();
    const start_date = (formData.get("start_date") as string)?.trim();
    const end_date = (formData.get("end_date") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!destination) return err("invalid_input", "Destination is required.", "destination empty");
    if (!start_date || !end_date) return err("invalid_input", "Dates are required.", "dates missing");

    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .insert({ family_id: familyId, destination, start_date, end_date, notes })
      .select("id")
      .single();

    if (tripError) {
      Sentry.captureException(tripError, { extra: { action: "createTrip" } });
      return err("db_error", "Could not save trip.", tripError.message);
    }

    // Pull family members for skill input. `?? []` here meant a failed read
    // produced a packing list for a household of zero adults — written to
    // trip_packing_items, through a paid model call, with the trip looking fine.
    const { data: members, error: membersError } = await supabase
      .from("family_members")
      .select("user_id, users(full_name)")
      .eq("family_id", familyId);

    if (membersError) {
      Sentry.captureException(membersError, {
        extra: { action: "createTrip", stage: "members", tripId: trip.id },
      });
      revalidatePath("/trips");
      return ok(
        { id: trip.id },
        "Trip saved, but we couldn't read who is travelling, so no packing list was generated. Open the trip to try again."
      );
    }

    // Fire skill to generate packing list + prep tasks
    const household = {
      adults: (members ?? [])
        .map((m) => ({
          name: (m.users as { full_name: string | null } | null)?.full_name ?? "Family member",
        })),
      kids: [] as Array<{ name: string; age_years: number }>,
    };

    const skillResult = await withRetry(() =>
      runTravelSkill(
        { destination, start_date, end_date, notes: notes ?? undefined, household },
        { familyId, userId }
      )
    );

    // The trip row exists from here on. Anything below that fails is a partial
    // result, not a failed action — so it is reported as a warning and never
    // swallowed. Both of these inserts used to discard their error entirely.
    const lost: string[] = [];

    if (skillResult.ok && skillResult.data) {
      // Insert packing items
      const packingItems = skillResult.data.packing_list.map((item) => ({
        trip_id: trip.id,
        item: item.item,
        notes: `owner:${item.owner}|category:${item.category}`,
        packed: false,
      }));

      if (packingItems.length > 0) {
        const { error: packingError } = await supabase
          .from("trip_packing_items")
          .insert(packingItems);
        if (packingError) {
          Sentry.captureException(packingError, {
            extra: { action: "createTrip", stage: "packing_items", tripId: trip.id },
          });
          lost.push("the packing list");
        }
      }

      // Insert prep tasks
      const tripStart = new Date(start_date);
      // Annotated with the table's Insert type, not inferred: inside a .map()
      // with no contextual type a string literal widens to `string` and the enum
      // catches nothing. This is the row that was being silently discarded.
      const prepTasks: Database["public"]["Tables"]["tasks"]["Insert"][] =
        skillResult.data.prep_tasks.map((t) => {
        const dueDate = new Date(tripStart);
        dueDate.setDate(dueDate.getDate() - t.days_before_departure);
        return {
          family_id: familyId,
          title: `[Trip: ${destination}] ${t.task}`,
          description: `Prep task for trip to ${destination} (${start_date})`,
          due_at: dueDate.toISOString(),
          // 'pending' is not one of the four values tasks.status accepts, so every
          // prep task a trip has ever generated was rejected — and, because the
          // insert's error went unread, rejected in complete silence.
          status: "open",
          };
        });

      if (prepTasks.length > 0) {
        const { error: tasksError } = await supabase.from("tasks").insert(prepTasks);
        if (tasksError) {
          Sentry.captureException(tasksError, {
            extra: { action: "createTrip", stage: "prep_tasks", tripId: trip.id },
          });
          lost.push("the prep tasks");
        }
      }
    }

    revalidatePath("/trips");
    revalidatePath("/now");
    return ok(
      { id: trip.id },
      lost.length > 0
        ? `Trip saved, but ${lost.join(" and ")} could not be saved. Try regenerating from the trip page.`
        : undefined
    );
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "createTrip" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function updateTrip(
  id: string,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const destination = (formData.get("destination") as string)?.trim();
    const start_date = (formData.get("start_date") as string)?.trim();
    const end_date = (formData.get("end_date") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!destination) return err("invalid_input", "Destination is required.", "destination empty");

    const { error } = await supabase
      .from("trips")
      .update({ destination, start_date, end_date, notes })
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "updateTrip", id } });
      return err("db_error", "Could not update trip.", error.message);
    }

    revalidatePath("/trips");
    revalidatePath(`/trips/${id}`);
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "updateTrip" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function togglePackingItem(
  item_id: string
): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthedFamily();

    // Get current packed state
    const { data: item } = await supabase
      .from("trip_packing_items")
      .select("packed")
      .eq("id", item_id)
      .maybeSingle();

    if (!item) return err("not_found", "Packing item not found.", `item ${item_id} not found`);

    const { error } = await supabase
      .from("trip_packing_items")
      .update({ packed: !item.packed })
      .eq("id", item_id);

    if (error) {
      Sentry.captureException(error, { extra: { action: "togglePackingItem", item_id } });
      return err("db_error", "Could not update item.", error.message);
    }

    revalidatePath("/trips");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "togglePackingItem" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function deleteTrip(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    // Cascade: delete packing items first. Read the error — if the children
    // survive, the parent delete below fails on the FK and the user is told the
    // trip could not be deleted with no clue why.
    const { error: childError } = await supabase
      .from("trip_packing_items")
      .delete()
      .eq("trip_id", id);
    if (childError) {
      Sentry.captureException(childError, { extra: { action: "deleteTrip", stage: "packing_items", id } });
      return err("db_error", "Could not delete this trip's packing list.", childError.message);
    }

    const { error } = await supabase
      .from("trips")
      .delete()
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "deleteTrip", id } });
      return err("db_error", "Could not delete trip.", error.message);
    }

    revalidatePath("/trips");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "deleteTrip" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
