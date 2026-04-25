"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { markReimbursementSettled } from "@/app/(app)/expenses/actions";

interface Reimbursement {
  id: string;
  amount_cents: number;
  status: string;
  settled_at: string | null;
  created_at: string;
  from_user_id: string;
  to_user_id: string;
}

interface ReimbursementsViewProps {
  outstanding: Reimbursement[];
  settled: Reimbursement[];
  currentUserId: string;
}

export function ReimbursementsView({
  outstanding: initialOutstanding,
  settled: initialSettled,
  currentUserId,
}: ReimbursementsViewProps) {
  const [outstanding, setOutstanding] = useState(initialOutstanding);
  const [settled, setSettled] = useState(initialSettled);
  const [error, setError] = useState<string | null>(null);

  async function handleSettle(id: string) {
    const result = await markReimbursementSettled(id);
    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }
    const item = outstanding.find((r) => r.id === id)!;
    setOutstanding((prev) => prev.filter((r) => r.id !== id));
    setSettled((prev) => [{ ...item, status: "settled", settled_at: new Date().toISOString() }, ...prev]);
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {/* Outstanding */}
      {outstanding.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">Outstanding</h2>
          {outstanding.map((r) => {
            const iOwed = r.to_user_id === currentUserId;
            const iOwe = r.from_user_id === currentUserId;
            return (
              <div key={r.id} className="p-3 border border-stone-200 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-800">
                    ${(r.amount_cents / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-stone-400">
                    {iOwed ? "You are owed" : iOwe ? "You owe" : "Pending"}
                    {" — "}{new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                {iOwed && (
                  <button
                    onClick={() => handleSettle(r.id)}
                    className="text-sm text-green-600 hover:underline"
                  >
                    Mark settled
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Settled */}
      {settled.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">Settled</h2>
          {settled.map((r) => (
            <div key={r.id} className="p-3 border border-stone-100 rounded-lg opacity-60">
              <span className="text-sm text-stone-600">${(r.amount_cents / 100).toFixed(2)}</span>
              <span className="text-xs text-stone-400 ml-2">
                Settled {r.settled_at ? new Date(r.settled_at).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
