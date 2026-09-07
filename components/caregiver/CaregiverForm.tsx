"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CAREGIVER_ROLES, CAREGIVER_ROLE_LABEL } from "@/lib/db/enums";

// Was a local list that included "au_pair" — a value caregivers.role has never
// accepted, so choosing it crashed the page. The options now come from the same
// module the server action validates against, which is the only way the two can
// stay in step.

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

/**
 * The Server Action is handed to <form action> directly.
 *
 * It used to be wrapped in useActionState, purely to get a `pending` flag for
 * the button, and that wrapper cost the form its progressive enhancement. A
 * server action passed straight to <form action> is posted by the browser
 * whether or not JavaScript has arrived; an inline client reducer gives the
 * browser no endpoint, so a submit landing before hydration did nothing — no
 * navigation, no error, no sign anything had been pressed.
 *
 * That is why write-paths.spec's caregiver test fails under parallel load and
 * passes alone: the click beat hydration. A person on a slow phone tapping
 * "Add caregiver" the moment it appears gets the same nothing.
 *
 * The pending state now comes from useFormStatus inside SubmitButton, which
 * reads the parent form without owning its submission.
 */
export function CaregiverForm({
  action,
  defaultValues,
  submitLabel = "Save caregiver",
}: CaregiverFormProps) {
  return (
    <form action={action} className="space-y-4">
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
          {CAREGIVER_ROLES.map((role) => (
            <option key={role} value={role}>
              {CAREGIVER_ROLE_LABEL[role]}
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
        <SubmitButton pendingLabel="Saving...">{submitLabel}</SubmitButton>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
