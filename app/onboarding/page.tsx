import { redirect } from "next/navigation";
import { lookupFamily } from "@/lib/auth/current-family";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  // The other half of the loop. Every page in the app redirected here when its
  // membership read failed, and this page swallowed the same read, agreed there
  // was no family, and offered to create one. A member of a working household
  // could be walked into a duplicate that way.
  //
  // Now a failed lookup throws to the error boundary. The wizard is shown only
  // when we have actually established that there is no family.
  const family = await lookupFamily();

  if (family.ok) redirect("/dashboard");
  if (family.reason === "unauthenticated") redirect("/login");
  if (family.reason === "lookup-failed") {
    throw new Error(`Could not check whether you already have a household: ${family.message}`);
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome! Let&apos;s set up your household.
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            This takes about 30 seconds.
          </p>
        </div>
        <OnboardingWizard />
      </div>
    </main>
  );
}
