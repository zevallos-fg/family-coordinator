import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReceiptList } from "@/components/receipt/ReceiptList";
import { requireFamily } from "@/lib/auth/current-family";

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: receipts } = await supabase
    .from("receipts")
    .select("id, purchased_at, total_cents, store_id, image_url, stores(name)")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main>
      <div className="space-y-6">
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
