import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptList } from "@/components/receipt/ReceiptList";

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", authData.user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { data: receipts } = await supabase
    .from("receipts")
    .select("id, purchased_at, total_cents, store_id, image_url, stores(name)")
    .eq("family_id", membership.family_id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-stone-800">Receipts</h1>
          <Link
            href="/receipts/new"
            className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            + Add receipt
          </Link>
        </div>

        <ReceiptList receipts={(receipts ?? []) as Parameters<typeof ReceiptList>[0]["receipts"]} />
      </div>
    </main>
  );
}
