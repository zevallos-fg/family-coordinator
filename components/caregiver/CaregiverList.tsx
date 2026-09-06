"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format/phone";
import { deleteWithUndo } from "@/lib/undo";

const ROLE_LABELS: Record<string, string> = {
  nanny: "Nanny",
  grandparent: "Grandparent",
  daycare: "Daycare",
  au_pair: "Au Pair",
  other: "Caregiver",
};

interface Caregiver {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export function CaregiverList({ caregivers }: { caregivers: Caregiver[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /**
   * One-touch, and the undo is real: fn_soft_delete banks caregiver_shifts, timesheets
   * and mileage along with the caregiver — and the briefs and recaps hanging off those
   * shifts, two levels down — so fn_restore returns the whole history, not just a name.
   */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Rows Undo brought back that the server hasn't re-sent yet.
  const [resurrected, setResurrected] = useState<Map<string, Caregiver>>(new Map());

  const refresh = () => startTransition(() => router.refresh());

  function hide(c: Caregiver) {
    setHidden((prev) => new Set(prev).add(c.id));
    setResurrected((prev) => {
      const next = new Map(prev);
      next.delete(c.id);
      return next;
    });
  }

  function show(c: Caregiver) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(c.id);
      return next;
    });
    setResurrected((prev) => new Map(prev).set(c.id, c));
  }

  async function handleDelete(c: Caregiver) {
    hide(c);
    await deleteWithUndo({
      table: "caregivers",
      ids: [c.id],
      message: `${c.name} removed`,
      onShow: () => show(c),
      onHide: () => hide(c),
      onSettled: refresh,
    });
  }

  const visible: Caregiver[] = [
    ...caregivers.filter((c) => !hidden.has(c.id)),
    ...[...resurrected.values()].filter((r) => !caregivers.some((c) => c.id === r.id)),
  ];

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-foreground/20 p-8 text-center">
        <p className="text-foreground/50 text-sm">No caregivers yet.</p>
        <Link href="/caregiver/caregivers/new">
          <Button className="mt-3">
            Add your first caregiver
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((c) => (
        <div
          key={c.id}
          className="flex items-start justify-between rounded-lg border border-foreground/10 p-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                {ROLE_LABELS[c.role] ?? c.role}
              </span>
            </div>
            {c.phone && (
              <p className="text-sm text-foreground/60 mt-0.5">{formatPhone(c.phone)}</p>
            )}
            {c.email && (
              <p className="text-sm text-foreground/60">{c.email}</p>
            )}
            {c.notes && (
              <p className="text-sm text-foreground/50 mt-1 truncate max-w-xs">
                {c.notes}
              </p>
            )}
          </div>
          <div className="flex gap-2 ml-4 shrink-0">
            <Link href={`/caregiver/caregivers/${c.id}`}>
              <Button variant="outline">
                Edit
              </Button>
            </Link>
            <Button variant="outline" onClick={() => handleDelete(c)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
