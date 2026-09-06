"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runExpenseParser } from "@/skills/family-expense-parser";
import type { ParsedExpense } from "@/skills/family-expense-parser";
import { lookupFamily } from "@/lib/auth/current-family";

export type { ParsedExpense };

export interface ExpenseSummary {
  total_cents: number;
  by_category: Record<string, number>;
  by_member: Record<string, number>;
  count: number;
}

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

export async function parseExpenseText(
  text: string,
  context?: string
): Promise<
  ActionResult<{ expense: ParsedExpense | null; reimbursement_needed: boolean; reasoning: string; confidence: number }>
> {
  try {
    const { supabase, userId, familyId } = await getAuthedFamily();

    // Get family members
    const { data: members } = await supabase
      .from("family_members")
      .select("user_id, users(full_name)")
      .eq("family_id", familyId);

    const familyMemberIds = (members ?? []).map((m) => ({
      user_id: m.user_id,
      name: (m.users as { full_name: string | null } | null)?.full_name ?? "Member",
    }));

    const skillResult = await withRetry(() =>
      runExpenseParser(
        {
          text,
          captured_at: new Date().toISOString().split("T")[0],
          captured_by_user_id: userId,
          family_member_user_ids: familyMemberIds,
          context,
        },
        { familyId, userId }
      )
    );

    if (!skillResult.ok || !skillResult.data) {
      return err(
        "skill_error",
        "Could not parse expense. Please try again.",
        skillResult.error?.message ?? "skill failed"
      );
    }

    return ok(skillResult.data);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "parseExpenseText" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function confirmAndCreateExpense(
  parsed: ParsedExpense,
  overrides?: Partial<ParsedExpense>
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const final = { ...parsed, ...overrides };

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        family_id: familyId,
        amount_cents: final.amount_cents,
        category: final.category,
        merchant: final.merchant,
        purchased_at: final.purchased_at,
        paid_by_user_id: final.paid_by_user_id,
        notes: final.notes ?? (final.kid_specific && final.kid_name ? `For ${final.kid_name}` : null),
      })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "confirmAndCreateExpense" } });
      return err("db_error", "Could not save expense.", error.message);
    }

    revalidatePath("/expenses");
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "confirmAndCreateExpense" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function createExpenseManual(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const amount_dollars = parseFloat(formData.get("amount_dollars") as string);
    const amount_cents = Math.round(amount_dollars * 100);
    const category = (formData.get("category") as string)?.trim() || "Other";
    const merchant = (formData.get("merchant") as string)?.trim() || null;
    const purchased_at = (formData.get("purchased_at") as string)?.trim() ||
      new Date().toISOString().split("T")[0];
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (isNaN(amount_cents) || amount_cents <= 0) {
      return err("invalid_input", "A valid amount is required.", "amount invalid");
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert({ family_id: familyId, amount_cents, category, merchant, purchased_at, notes })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "createExpenseManual" } });
      return err("db_error", "Could not save expense.", error.message);
    }

    revalidatePath("/expenses");
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "createExpenseManual" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function createReimbursement(
  from_user_id: string,
  to_user_id: string,
  expense_ids: string[],
  amount_cents: number
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { data, error } = await supabase
      .from("reimbursements")
      .insert({
        family_id: familyId,
        from_user_id,
        to_user_id,
        expense_ids,
        amount_cents,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      Sentry.captureException(error, { extra: { action: "createReimbursement" } });
      return err("db_error", "Could not create reimbursement.", error.message);
    }

    revalidatePath("/expenses/reimbursements");
    return ok({ id: data.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "createReimbursement" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function markReimbursementSettled(
  id: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { error } = await supabase
      .from("reimbursements")
      .update({ status: "settled", settled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "markReimbursementSettled", id } });
      return err("db_error", "Could not mark settled.", error.message);
    }

    revalidatePath("/expenses/reimbursements");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "markReimbursementSettled" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function getExpenseSummary(
  period: string
): Promise<ActionResult<ExpenseSummary>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    // period format: "YYYY-MM"
    const startDate = `${period}-01`;
    const [year, month] = period.split("-").map(Number);
    const endDate = new Date(year, month, 0).toISOString().split("T")[0];

    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("amount_cents, category, paid_by_user_id, users(full_name)")
      .eq("family_id", familyId)
      .gte("purchased_at", startDate)
      .lte("purchased_at", endDate);

    if (error) {
      Sentry.captureException(error, { extra: { action: "getExpenseSummary" } });
      return err("db_error", "Could not load summary.", error.message);
    }

    const summary: ExpenseSummary = {
      total_cents: 0,
      by_category: {},
      by_member: {},
      count: expenses?.length ?? 0,
    };

    for (const exp of expenses ?? []) {
      summary.total_cents += exp.amount_cents;
      const cat = exp.category ?? "Other";
      summary.by_category[cat] = (summary.by_category[cat] ?? 0) + exp.amount_cents;
      const memberName = (exp.users as { full_name: string | null } | null)?.full_name ?? "Unknown";
      summary.by_member[memberName] = (summary.by_member[memberName] ?? 0) + exp.amount_cents;
    }

    return ok(summary);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "getExpenseSummary" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
