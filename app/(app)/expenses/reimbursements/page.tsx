import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ReimbursementsView } from "@/components/expenses/ReimbursementsView";
import Link from "next/link";
import { requireFamily } from "@/lib/auth/current-family";

async function getReimbursements() {
  const supabase = await createClient();
  const { userId, familyId } = await requireFamily();

  const { data: reimbursements, error } = await supabase
    .from("reimbursements")
    .select("id, amount_cents, status, settled_at, created_at, from_user_id, to_user_id")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  return {
    reimbursements: reimbursements ?? [],
    error: error?.message ?? null,
    userId: userId,
  };
}

export default async function ReimbursementsPage() {
  const { reimbursements, error, userId } = await getReimbursements();

  const outstanding = reimbursements.filter((r) => r.status === "pending");
  const settled = reimbursements.filter((r) => r.status === "settled");

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/expenses" className="text-sm text-stone-400 hover:text-stone-600">← Expenses</Link>
          <h1 className="text-xl font-bold text-stone-800 mt-2">Reimbursements</h1>
        </div>
      </div>

      {error && <ErrorBanner userMessage="Could not load reimbursements." />}

      {!error && reimbursements.length === 0 && (
        <EmptyState
          title="No reimbursements yet"
          description="Reimbursements are created when one family member pays for a shared expense."
        />
      )}

      {!error && reimbursements.length > 0 && (
        <ReimbursementsView
          outstanding={outstanding}
          settled={settled}
          currentUserId={userId}
        />
      )}
    </main>
  );
}
