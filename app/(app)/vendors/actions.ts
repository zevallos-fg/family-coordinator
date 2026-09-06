"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runVendorMemory } from "@/skills/family-vendor-memory";
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

export async function createVendor(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const name = (formData.get("name") as string)?.trim();
    const category = (formData.get("category") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const website = (formData.get("website") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!name) return err("invalid_input", "Vendor name is required.", "name field empty");

    const { data, error } = await supabase
      .from("vendors")
      .insert({ family_id: familyId, name, category, phone, email, website, notes })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "createVendor" } });
      return err("db_error", "Could not save vendor.", error.message);
    }

    revalidatePath("/vendors");
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "createVendor" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function updateVendor(
  id: string,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const name = (formData.get("name") as string)?.trim();
    const category = (formData.get("category") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const website = (formData.get("website") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!name) return err("invalid_input", "Vendor name is required.", "name field empty");

    const { error } = await supabase
      .from("vendors")
      .update({ name, category, phone, email, website, notes })
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "updateVendor", id } });
      return err("db_error", "Could not update vendor.", error.message);
    }

    revalidatePath("/vendors");
    revalidatePath(`/vendors/${id}`);
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "updateVendor" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function deleteVendor(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    // Cascade protection: check for vendor_services
    const { count, error: countError } = await supabase
      .from("vendor_services")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", id);

    if (countError) {
      Sentry.captureException(countError, { extra: { action: "deleteVendor", id } });
      return err("db_error", "Could not check vendor services.", countError.message);
    }

    if ((count ?? 0) > 0) {
      return err(
        "has_dependencies",
        "This vendor has service records. Delete all service logs first.",
        `vendor ${id} has ${count} service records`
      );
    }

    const { error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "deleteVendor", id } });
      return err("db_error", "Could not delete vendor.", error.message);
    }

    revalidatePath("/vendors");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "deleteVendor" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function logVendorService(
  vendor_id: string,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    // Verify vendor belongs to family
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!vendor) return err("not_found", "Vendor not found.", `vendor ${vendor_id} not in family`);

    const service_date = (formData.get("service_date") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim() || null;
    const cost_cents_raw = formData.get("cost_cents");
    const cost_cents = cost_cents_raw ? parseInt(cost_cents_raw as string, 10) : null;

    if (!service_date) {
      return err("invalid_input", "Service date is required.", "service_date field empty");
    }

    const { error } = await supabase
      .from("vendor_services")
      .insert({ vendor_id, service_date, notes, cost_cents });

    if (error) {
      Sentry.captureException(error, { extra: { action: "logVendorService", vendor_id } });
      return err("db_error", "Could not log service.", error.message);
    }

    // Update last_used_at on vendor. Denormalised from vendor_services with no
    // trigger behind it, so when this silently fails the vendor page reads
    // "LAST USED — Never" directly above the service that was just logged.
    const { error: stampError } = await supabase
      .from("vendors")
      .update({ last_used_at: service_date })
      .eq("id", vendor_id)
      .eq("family_id", familyId);

    if (stampError) {
      Sentry.captureException(stampError, {
        extra: { action: "logVendorService", stage: "last_used_at", vendor_id },
      });
    }

    revalidatePath(`/vendors/${vendor_id}`);
    revalidatePath("/vendors");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "logVendorService" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function queryVendorMemory(
  text: string
): Promise<ActionResult<{ matches: unknown[]; suggestion: string | null }>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    // Pull all vendors for this family with their services
    const { data: vendors, error: vendorsError } = await supabase
      .from("vendors")
      .select(`
        id, name, category, last_used_at, notes,
        vendor_services(notes)
      `)
      .eq("family_id", familyId);

    if (vendorsError) {
      Sentry.captureException(vendorsError, { extra: { action: "queryVendorMemory" } });
      return err("db_error", "Could not load vendors.", vendorsError.message);
    }

    const vendorInputs = (vendors ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category ?? "Uncategorized",
      last_used_at: v.last_used_at,
      notes: v.notes,
      services: (v.vendor_services as Array<{ notes: string | null }>)
        .map((s) => s.notes)
        .filter((n): n is string => n !== null),
    }));

    const skillResult = await withRetry(() =>
      runVendorMemory(
        { queryText: text, vendors: vendorInputs },
        { familyId, userId }
      )
    );

    if (!skillResult.ok) {
      return err(
        skillResult.error?.code ?? "skill_error",
        "Could not search vendors.",
        skillResult.error?.message ?? "skill returned error"
      );
    }

    return ok({
      matches: skillResult.data?.matches ?? [],
      suggestion: skillResult.data?.suggestion ?? null,
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "queryVendorMemory" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
