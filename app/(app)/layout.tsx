import { TopNav } from "@/components/nav/TopNav";
import { MobileNav } from "@/components/nav/MobileNav";
import { requireFamily } from "@/lib/auth/current-family";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The shell renders for everyone in the app group, so this is the gate: no
  // session sends you to /login, no family to /onboarding, and a lookup that
  // fails throws to app/error.tsx rather than picking one of those for you.
  await requireFamily();

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="hidden sm:block">
        <TopNav />
      </div>
      <div className="sm:hidden">
        <MobileNav />
      </div>
      <main className="max-w-6xl mx-auto px-4 py-6 pb-24 sm:pb-6">{children}</main>
    </div>
  );
}
