"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CAREGIVER_ROLES = [
  { value: "nanny", label: "Nanny" },
  { value: "grandparent", label: "Grandparent" },
  { value: "daycare", label: "Daycare" },
  { value: "au_pair", label: "Au Pair" },
  { value: "other", label: "Other" },
];

interface CaregiverFormProps {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  submitLabel?: string;
}

export function CaregiverForm({
  action,
  defaultValues,
  submitLabel = "Save caregiver",
}: CaregiverFormProps) {
  const [, formAction, pending] = useActionState(
    async (_: unknown, formData: FormData) => {
      await action(formData);
      return null;
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="name">
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaultValues?.name}
          placeholder="e.g. Maria, Grandma Rosa"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="role">
          Role <span className="text-red-500">*</span>
        </label>
        <select
          id="role"
          name="role"
          required
          defaultValue={defaultValues?.role ?? "nanny"}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        >
          {CAREGIVER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="phone">
          Phone
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultValues?.phone}
          placeholder="(305) 555-0100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultValues?.email}
          placeholder="maria@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes}
          placeholder="Any notes about this caregiver..."
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
