"use client";

import { useState, useRef } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { LoadingState } from "@/components/ui/LoadingState";
import { parseExpenseText, createExpenseManual, confirmAndCreateExpense } from "@/app/(app)/expenses/actions";
import type { ParsedExpense } from "@/app/(app)/expenses/actions";

interface Expense {
  id: string;
  amount_cents: number;
  category: string | null;
  merchant: string | null;
  purchased_at: string | null;
  notes: string | null;
}

interface ExpenseViewProps {
  expenses: Expense[];
  total_cents: number;
  period: string;
  categories: string[];
}

type AddMode = "idle" | "text" | "manual";

export function ExpenseView({ expenses, total_cents, period, categories }: ExpenseViewProps) {
  const [addMode, setAddMode] = useState<AddMode>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uncontrolled: the DOM keeps the description typed before hydration, which a
  // controlled binding would have discarded unrecoverably.
  const parseTextRef = useRef<HTMLTextAreaElement>(null);
  const [parsedResult, setParsedResult] = useState<{
    expense: ParsedExpense | null;
    reasoning: string;
    confidence: number;
    reimbursement_needed: boolean;
  } | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");

  async function handleParseText(e: React.FormEvent) {
    e.preventDefault();
    const parseText = parseTextRef.current?.value.trim() ?? "";
    if (!parseText) return;
    setLoading(true);
    setError(null);
    const result = await parseExpenseText(parseText);
    setLoading(false);
    if (!result.ok) { setError(result.error.userMessage); return; }
    setParsedResult(result.data);
  }

  async function handleConfirmParsed() {
    if (!parsedResult?.expense) return;
    setLoading(true);
    const result = await confirmAndCreateExpense(parsedResult.expense);
    setLoading(false);
    if (!result.ok) { setError(result.error.userMessage); return; }
    setAddMode("idle");
    setParsedResult(null);
    if (parseTextRef.current) parseTextRef.current.value = "";
    window.location.reload();
  }

  async function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await createExpenseManual(formData);
    setLoading(false);
    if (!result.ok) { setError(result.error.userMessage); return; }
    setAddMode("idle");
    window.location.reload();
  }

  const filtered = filterCategory
    ? expenses.filter((e) => e.category === filterCategory)
    : expenses;

  if (loading) return <LoadingState text="Processing expense..." />;

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {/* Summary card */}
      <div className="p-4 border border-stone-200 rounded-xl bg-stone-50">
        <p className="text-xs text-stone-400 uppercase tracking-wide">{period} Total</p>
        <p className="text-2xl font-bold text-stone-800 mt-1">
          ${(total_cents / 100).toFixed(2)}
        </p>
        <p className="text-xs text-stone-400 mt-0.5">{expenses.length} transactions</p>
      </div>

      {/* Add expense */}
      {addMode === "idle" && (
        <div className="flex gap-2">
          <button onClick={() => setAddMode("text")} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            + From text
          </button>
          <button onClick={() => setAddMode("manual")} className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50">
            + Manual
          </button>
        </div>
      )}

      {/* Text parse path */}
      {addMode === "text" && !parsedResult && (
        <form onSubmit={handleParseText} className="p-4 border border-stone-200 rounded-xl space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Describe the expense</h3>
          <textarea
            ref={parseTextRef}
            rows={3}
            required
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
            placeholder="e.g. spent $45.99 at Publix today..."
          />
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Parse</button>
            <button type="button" onClick={() => setAddMode("idle")} className="px-4 py-2 border border-stone-300 rounded-lg text-sm text-stone-600">Cancel</button>
          </div>
        </form>
      )}

      {/* Review parsed result */}
      {addMode === "text" && parsedResult && (
        <div className="p-4 border border-stone-200 rounded-xl space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Review Parsed Expense</h3>
          {!parsedResult.expense ? (
            <p className="text-sm text-stone-500">No expense found: {parsedResult.reasoning}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-stone-500">Amount:</span> <strong>${(parsedResult.expense.amount_cents / 100).toFixed(2)}</strong></div>
                <div><span className="text-stone-500">Category:</span> {parsedResult.expense.category}</div>
                <div><span className="text-stone-500">Merchant:</span> {parsedResult.expense.merchant ?? "—"}</div>
                <div><span className="text-stone-500">Date:</span> {parsedResult.expense.purchased_at}</div>
              </div>
              {parsedResult.expense.kid_specific && (
                <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">For {parsedResult.expense.kid_name}</div>
              )}
              {parsedResult.reimbursement_needed && (
                <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">Reimbursement may be needed</div>
              )}
              <p className="text-xs text-stone-400">Confidence: {Math.round(parsedResult.confidence * 100)}% — {parsedResult.reasoning}</p>
            </div>
          )}
          <div className="flex gap-2">
            {parsedResult.expense && (
              <button onClick={handleConfirmParsed} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">Save Expense</button>
            )}
            <button onClick={() => { setParsedResult(null); setAddMode("idle"); }} className="px-4 py-2 border border-stone-300 rounded-lg text-sm text-stone-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Manual form */}
      {addMode === "manual" && (
        <form onSubmit={handleManualSubmit} className="p-4 border border-stone-200 rounded-xl space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Manual Expense</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Amount ($) *</label>
              <input name="amount_dollars" type="number" step="0.01" min="0.01" required className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" placeholder="45.99" />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Category</label>
              <select name="category" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Merchant</label>
              <input name="merchant" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" placeholder="Publix, Amazon..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Date</label>
              <input name="purchased_at" type="date" defaultValue={new Date().toISOString().split("T")[0]} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes</label>
            <input name="notes" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-stone-700 text-white rounded-lg text-sm font-medium">Save</button>
            <button type="button" onClick={() => setAddMode("idle")} className="px-4 py-2 border border-stone-300 rounded-lg text-sm text-stone-600">Cancel</button>
          </div>
        </form>
      )}

      {/* Filter */}
      {expenses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterCategory("")} className={`px-2 py-1 rounded text-xs font-medium ${!filterCategory ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>All</button>
          {[...new Set(expenses.map((e) => e.category ?? "Other"))].map((cat) => (
            <button key={cat} onClick={() => setFilterCategory(cat === filterCategory ? "" : cat)}
              className={`px-2 py-1 rounded text-xs font-medium ${filterCategory === cat ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left">
                <th className="pb-2 font-medium text-stone-500">Date</th>
                <th className="pb-2 font-medium text-stone-500">Merchant</th>
                <th className="pb-2 font-medium text-stone-500">Category</th>
                <th className="pb-2 font-medium text-stone-500 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="py-2 text-stone-400 text-xs">{e.purchased_at ? new Date(e.purchased_at).toLocaleDateString() : "—"}</td>
                  <td className="py-2 text-stone-700">{e.merchant ?? <span className="text-stone-400">—</span>}</td>
                  <td className="py-2 text-stone-500 text-xs">{e.category ?? "Other"}</td>
                  <td className="py-2 text-stone-800 font-medium text-right">${(e.amount_cents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
