import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptDetail } from "@/components/receipt/ReceiptDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceiptDetailPage({ params }: Props) {
  const { id } = await params;
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

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, purchased_at, total_cents, image_url, store_id, stores(name)")
    .eq("id", id)
    .eq("family_id", membership.family_id)
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
          <a href="/receipts" className="text-stone-400 hover:text-stone-600 text-xl leading-none">
            ←
          </a>
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
