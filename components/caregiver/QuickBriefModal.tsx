"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createShift } from "@/app/(app)/caregiver/actions";

interface QuickBriefModalProps {
  caregivers: Array<{ id: string; name: string; role: string }>;
  kids: Array<{ id: string; name: string }>;
}

export function QuickBriefModal({ caregivers, kids }: QuickBriefModalProps) {
  const [open, setOpen] = useState(false);

  const [, formAction, pending] = useActionState(
    async (_: unknown, formData: FormData) => {
      // Build kid_names from checked kids
      const checked = kids.filter((k) =>
        formData.get(`kid_${k.id}`) === "on"
      );
      formData.set("kid_names", checked.map((k) => k.name).join(","));
      await createShift(formData);
      return null;
    },
    null
  );

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setSeconds(0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 9 * 60 * 60 * 1000);
  const toLocalInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="bg-amber-600 hover:bg-amber-700 text-white"
      >
        Quick brief
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-background border border-foreground/10 shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Quick brief</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-foreground/40 hover:text-foreground/70 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="qb_caregiver">
              Caregiver
            </label>
            <select
              id="qb_caregiver"
              name="caregiver_id"
              required
              className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
            >
              {caregivers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="block text-sm font-medium mb-1">Kid(s)</p>
            {kids.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`kid_${k.id}`}
                  defaultChecked
                  className="rounded"
                />
                {k.name}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-foreground/50 mb-1">Start</label>
              <input
                name="start_at"
                type="datetime-local"
                required
                defaultValue={toLocalInput(defaultStart)}
                className="w-full rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground/50 mb-1">End</label>
              <input
                name="end_at"
                type="datetime-local"
                required
                defaultValue={toLocalInput(defaultEnd)}
                className="w-full rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating shift..." : "Create shift & go →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
