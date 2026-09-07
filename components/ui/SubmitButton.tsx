"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * A submit button that knows whether its form is submitting, without the form
 * having to hold that in state.
 *
 * This exists to remove a reason to reach for `useActionState`. Wrapping a
 * Server Action in `useActionState` only to get a `pending` flag costs the form
 * its progressive enhancement: `<form action={someServerAction}>` is submitted
 * by the browser whether or not JavaScript has arrived, but
 * `<form action={formActionFromUseActionState}>` — where the reducer is an
 * inline client function — has no endpoint for the browser to post to, so a
 * submit before hydration does nothing at all, silently.
 *
 * `useFormStatus` reads the status of the nearest parent form from a child, so
 * the form keeps the server action and gets the spinner too.
 *
 * Must be a *child* of the form, never in the same component that renders
 * <form> — that is how the hook finds it.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
