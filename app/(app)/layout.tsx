import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/nav/TopNav";
import { MobileNav } from "@/components/nav/MobileNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="hidden sm:block">
        <TopNav />
      </div>
      <div className="sm:hidden">
        <MobileNav />
      </div>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
