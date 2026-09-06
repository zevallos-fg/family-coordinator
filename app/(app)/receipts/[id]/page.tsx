import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReceiptDetail } from "@/components/receipt/ReceiptDetail";
import { requireFamily } from "@/lib/auth/current-family";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceiptDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, purchased_at, total_cents, image_url, store_id, stores(name)")
    .eq("id", id)
    .eq("family_id", familyId)
    .single();

  if (!receipt) notFound();

  const { data: items } = await supabase
    .from("receipt_items")
    .select("id, name, amount, price_cents")
    .eq("receipt_id", id)
    .order("id");

  const storeData = receipt.stores as { name: string } | null;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/receipts" className="text-stone-400 hover:text-stone-600 text-xl leading-none">
            ←
          </Link>
          <h1 className="text-xl font-bold text-stone-800">Receipt</h1>
        </div>

        <ReceiptDetail
          receiptId={id}
          storeName={storeData?.name ?? null}
          purchasedAt={receipt.purchased_at}
          totalCents={receipt.total_cents}
          imageUrl={receipt.image_url}
          items={items ?? []}
        />
      </div>
    </main>
  );
}
