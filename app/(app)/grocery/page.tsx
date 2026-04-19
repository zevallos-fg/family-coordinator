import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { GroceryList } from "@/components/grocery/GroceryList";
import { AddItemForm } from "@/components/grocery/AddItemForm";
import { StoreFilter } from "@/components/grocery/StoreFilter";

interface PageProps {
  searchParams: Promise<{ store?: string }>;
}

export default async function GroceryPage({ searchParams }: PageProps) {
  const { store: storeFilter } = await searchParams;

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

  const familyId = membership.family_id;

  const [{ data: allItems }, { data: stores }] = await Promise.all([
    supabase
      .from("grocery_items")
      .select("id, name, quantity, in_cart, store_id, stores(name)")
      .eq("family_id", familyId)
      .is("completed_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("stores")
      .select("id, name")
      .eq("family_id", familyId)
      .order("name"),
  ]);

  const items = (allItems ?? []).map((item) => ({
    ...item,
    stores: item.stores as { name: string } | null,
  }));

  const filtered =
    storeFilter === "none"
      ? items.filter((i) => !i.store_id)
      : storeFilter
      ? items.filter((i) => i.store_id === storeFilter)
      : items;

  const pending = filtered.filter((i) => !i.in_cart);
  const inCart = filtered.filter((i) => i.in_cart);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Grocery</h1>
        <p className="text-sm text-stone-400 mt-0.5">
          {pending.length} to get · {inCart.length} in cart
        </p>
      </div>

      <AddItemForm />

      <Suspense fallback={null}>
        <StoreFilter stores={stores ?? []} />
      </Suspense>

      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
            To get
          </h2>
          <GroceryList items={pending} />
        </div>
      )}

      {inCart.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
            In cart
          </h2>
          <GroceryList items={inCart} />
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-10 text-stone-400 bg-white rounded-xl border border-stone-200">
          <p className="text-sm">Empty list</p>
          <p className="text-xs mt-1">Add items above or capture grocery notes in the Capture tab</p>
        </div>
      )}
    </div>
  );
}
