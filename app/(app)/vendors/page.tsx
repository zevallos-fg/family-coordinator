import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { VendorTable } from "@/components/vendors/VendorTable";
import { VendorMemorySearch } from "@/components/vendors/VendorMemorySearch";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

async function getVendors() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("id, name, category, phone, email, last_used_at, rating")
    .eq("family_id", membership.family_id)
    .order("name");

  return { vendors: vendors ?? [], error: error?.message ?? null };
}

export default async function VendorsPage() {
  const { vendors, error } = await getVendors();

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Vendors</h1>
          <p className="text-sm text-stone-400 mt-1">
            Your household service providers and contractors.
          </p>
        </div>
        <a
          href="/vendors/new"
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          + Add vendor
        </a>
      </div>

      {/* Memory search */}
      <div className="p-4 border border-stone-200 rounded-xl bg-stone-50">
        <h2 className="text-sm font-medium text-stone-600 mb-3">Find a vendor by need</h2>
        <VendorMemorySearch />
      </div>

      {/* Error state */}
      {error && (
        <ErrorBanner userMessage="Could not load vendors. Please refresh the page." />
      )}

      {/* Empty state */}
      {!error && vendors.length === 0 && (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-3a2 2 0 012-2h2a2 2 0 012 2v3" />
            </svg>
          }
          title="No vendors yet"
          description="Add your plumber, HVAC tech, landscaper, and other household service providers."
          action={
            <a
              href="/vendors/new"
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              Add your first vendor
            </a>
          }
        />
      )}

      {/* Vendor list */}
      {!error && vendors.length > 0 && (
        <VendorTable vendors={vendors} />
      )}
    </main>
  );
}
