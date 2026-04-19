"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
  const [, formAction, pending] = useActionState(
    async (_: unknown, formData: FormData) => {
      await createShift(formData);
      return null;
    },
    null
  );

  const now = new Date();
  const defaultStart = defaultStartAt ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0);
  const defaultEnd = new Date(defaultStart.getFullYear(), defaultStart.getMonth(), defaultStart.getDate(), defaultStart.getHours() + 8, defaultStart.getMinutes());
  const toLocalInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <form action={formAction} className="space-y-4">
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
          <>
            <input
              type="hidden"
              name="kid_names"
              id="kid_names_hidden"
            />
            <div className="space-y-1">
              {kids.map((k) => (
                <label key={k.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    defaultChecked={defaultKidNames?.includes(k.name)}
                    onChange={(e) => {
                      const hidden = document.getElementById("kid_names_hidden") as HTMLInputElement;
                      const current = hidden.value
                        ? hidden.value.split(",").filter(Boolean)
                        : [];
                      if (e.target.checked) {
                        hidden.value = [...current, k.name].join(",");
                      } else {
                        hidden.value = current.filter((n) => n !== k.name).join(",");
                      }
                    }}
                    className="rounded"
                  />
                  {k.name}
                </label>
              ))}
            </div>
          </>
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
        <Button type="submit" disabled={pending || caregivers.length === 0 || kids.length === 0}>
          {pending ? "Scheduling..." : "Schedule shift"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
