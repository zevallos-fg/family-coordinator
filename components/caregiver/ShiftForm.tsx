"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createShift } from "@/app/(app)/caregiver/actions";

interface ShiftFormProps {
  caregivers: Array<{ id: string; name: string; role: string }>;
  kids: Array<{ id: string; name: string }>;
  defaultCaregiverId?: string;
  defaultKidNames?: string[];
  defaultStartAt?: Date; // week-aware default start time
}

export function ShiftForm({
  caregivers,
  kids,
  defaultCaregiverId,
  defaultKidNames,
  defaultStartAt,
}: ShiftFormProps) {
  const now = new Date();
  const defaultStart = defaultStartAt ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0);
  const defaultEnd = new Date(defaultStart.getFullYear(), defaultStart.getMonth(), defaultStart.getDate(), defaultStart.getHours() + 8, defaultStart.getMinutes());
  const toLocalInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <form action={createShift} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="caregiver_id">
          Caregiver <span className="text-red-500">*</span>
        </label>
        {caregivers.length === 0 ? (
          <p className="text-sm text-foreground/50">
            No caregivers yet.{" "}
            <Link href="/caregiver/caregivers/new" className="underline">
              Add one first.
            </Link>
          </p>
        ) : (
          <select
            id="caregiver_id"
            name="caregiver_id"
            required
            defaultValue={defaultCaregiverId}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            <option value="">Select a caregiver...</option>
            {caregivers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Kids <span className="text-red-500">*</span>
        </label>
        {kids.length === 0 ? (
          <p className="text-sm text-foreground/50">
            No kids yet.{" "}
            <Link href="/caregiver/kids/new" className="underline">
              Add one first.
            </Link>
          </p>
        ) : (
          // Checkboxes that share a name are how HTML has always sent a
          // multi-select, and the browser does it with no JavaScript at all.
          //
          // This replaces a hidden field that an onChange handler kept in sync.
          // That handler only ever ran on a *toggle*, so the kids ticked by
          // `defaultChecked` were never written into it: anyone who accepted the
          // defaults and pressed Schedule sent an empty kid list, and the shift
          // was created for nobody. Nothing about that needed hydration to go
          // wrong — it was wrong on every submit that did not touch a box.
          <div className="space-y-1">
            {kids.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="kid_names"
                  value={k.name}
                  defaultChecked={defaultKidNames?.includes(k.name)}
                  className="rounded"
                />
                {k.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="start_at">
            Start <span className="text-red-500">*</span>
          </label>
          <input
            id="start_at"
            name="start_at"
            type="datetime-local"
            required
            defaultValue={toLocalInput(defaultStart)}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="end_at">
            End <span className="text-red-500">*</span>
          </label>
          <input
            id="end_at"
            name="end_at"
            type="datetime-local"
            required
            defaultValue={toLocalInput(defaultEnd)}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <SubmitButton
          pendingLabel="Scheduling..."
          disabled={caregivers.length === 0 || kids.length === 0}
        >
          Schedule shift
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
