"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFamily, sendInvite } from "./actions";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateFamily(formData: FormData) {
    startTransition(async () => {
      const result = await createFamily(formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("familyId" in result && result.familyId) {
        setFamilyId(result.familyId);
        setStep(2);
      }
    });
  }

  function handleInvite(formData: FormData) {
    if (!familyId) return;
    startTransition(async () => {
      const result = await sendInvite(familyId, formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("token" in result && result.token) {
        const inviteUrl = `${window.location.origin}/invite/${result.token}`;
        console.log("Invite URL:", inviteUrl);
        toast.success(`Invite link created! Share: ${inviteUrl}`);
      }
      router.push("/dashboard");
    });
  }

  if (step === 1) {
    return (
      <form action={handleCreateFamily} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm font-medium">
            Family name <span className="text-red-500">*</span>
          </label>
          <Input
            id="name"
            name="name"
            placeholder="The Johnson Family"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="city" className="block text-sm font-medium">
            City <span className="text-foreground/40 font-normal">(optional)</span>
          </label>
          <Input
            id="city"
            name="city"
            placeholder="Austin, TX"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="timezone" className="block text-sm font-medium">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue="America/New_York"
            disabled={isPending}
            className="flex h-10 w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating…" : "Create family"}
        </Button>
      </form>
    );
  }

  return (
    <form action={handleInvite} className="space-y-4">
      <p className="text-sm text-foreground/60">
        Send your partner a link to join your family. You can also do this
        later from settings.
      </p>

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Partner's email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="partner@example.com"
          disabled={isPending}
        />
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isPending}
          onClick={() => router.push("/dashboard")}
        >
          Skip for now
        </Button>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? "Sending…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
