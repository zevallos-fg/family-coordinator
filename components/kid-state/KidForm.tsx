"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KidFormProps {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    name?: string;
    birth_date?: string;
    notes?: string;
    food_favorites?: string[];
    food_aversions?: string[];
  };
  submitLabel?: string;
}

export function KidForm({ action, defaultValues, submitLabel = "Save" }: KidFormProps) {
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
          placeholder="e.g. Leo"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="birth_date">
          Birthday
        </label>
        <Input
          id="birth_date"
          name="birth_date"
          type="date"
          defaultValue={defaultValues?.birth_date}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="notes">
          Notes (current state)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={defaultValues?.notes}
          placeholder="What's your child up to right now? Sleep patterns, current interests, in-progress issues... The AI will keep this updated."
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="food_favorites">
          Food favorites
        </label>
        <Input
          id="food_favorites"
          name="food_favorites"
          defaultValue={defaultValues?.food_favorites?.join(", ")}
          placeholder="blueberries, mac and cheese, apples (comma-separated)"
        />
        <p className="text-xs text-foreground/40 mt-1">Separate with commas</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="food_aversions">
          Won&apos;t eat / allergies
        </label>
        <Input
          id="food_aversions"
          name="food_aversions"
          defaultValue={defaultValues?.food_aversions?.join(", ")}
          placeholder="broccoli, loud foods, peanuts (comma-separated)"
        />
        <p className="text-xs text-foreground/40 mt-1">Separate with commas</p>
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
