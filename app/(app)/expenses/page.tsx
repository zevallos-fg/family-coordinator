import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ExpenseView } from "@/components/expenses/ExpenseView";
import Link from "next/link";

const CATEGORIES = ["Groceries", "Dining", "Medical", "Education", "Activities", "Clothing", "Home", "Transportation", "Utilities", "Entertainment", "Childcare", "Other"];

async function getExpenses(period: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const startDate = `${period}-01`;
  const [year, month] = period.split("-").map(Number);
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, amount_cents, category, merchant, purchased_at, notes")
    .eq("family_id", membership.family_id)
    .gte("purchased_at", startDate)
    .lte("purchased_at", endDate)
    .order("purchased_at", { ascending: false });

  return { expenses: expenses ?? [], error: error?.message ?? null };
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  const period = sp.period ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const { expenses, error } = await getExpenses(period);

  const total_cents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Expenses</h1>
          <p className="text-sm text-stone-400 mt-1">Track family spending.</p>
        </div>
        <Link
          href="/expenses/reimbursements"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          Reimbursements →
        </Link>
      </div>

      {error && <ErrorBanner userMessage="Could not load expenses." />}

      <ExpenseView
        expenses={expenses}
        total_cents={total_cents}
        period={period}
        categories={CATEGORIES}
      />

      {!error && expenses.length === 0 && (
        <EmptyState
          title="No expenses this month"
          description="Add your first expense using text or the manual form."
        />
      )}
    </main>
  );
}
