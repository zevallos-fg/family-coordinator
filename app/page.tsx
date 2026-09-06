import { redirect } from "next/navigation";
import { requireFamily } from "@/lib/auth/current-family";

export default async function RootPage() {
  // Only here to route: requireFamily sends you to /login or /onboarding when
  // that is the answer, and throws when it does not have one.
  await requireFamily();

  redirect("/dashboard");
}
