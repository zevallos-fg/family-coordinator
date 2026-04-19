"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { deleteCaregiver } from "@/app/(app)/caregiver/actions";
import { formatPhone } from "@/lib/format/phone";

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
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Remove this caregiver?")) return;
    setDeleting(id);
    try {
      await deleteCaregiver(id);
    } finally {
      setDeleting(null);
    }
  }

  if (caregivers.length === 0) {
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
      {caregivers.map((c) => (
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
            <Button
              variant="outline"
             
              onClick={() => handleDelete(c.id)}
              disabled={deleting === c.id}
            >
              {deleting === c.id ? "..." : "Remove"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
