import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { VendorServiceLog } from "@/components/vendors/VendorServiceLog";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { requireFamily } from "@/lib/auth/current-family";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getVendor(id: string) {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .eq("family_id", familyId)
    .maybeSingle();

  if (vendorError || !vendor) return { vendor: null, services: [], error: vendorError?.message };

  const { data: services } = await supabase
    .from("vendor_services")
    .select("id, service_date, notes, cost_cents")
    .eq("vendor_id", id)
    .order("service_date", { ascending: false });

  return { vendor, services: services ?? [], error: null };
}

export default async function VendorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { vendor, services, error } = await getVendor(id);

  if (!vendor && !error) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/vendors" className="text-sm text-stone-400 hover:text-stone-600">
          ← Vendors
        </Link>
        {vendor && (
          <h1 className="text-2xl font-bold text-stone-800 mt-2">{vendor.name}</h1>
        )}
      </div>

      {error && (
        <ErrorBanner userMessage="Could not load vendor details." />
      )}

      {vendor && (
        <>
          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 p-4 border border-stone-200 rounded-xl">
            <div>
              <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Category</p>
              <p className="text-sm text-stone-700">{vendor.category ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Phone</p>
              <p className="text-sm text-stone-700">
                {vendor.phone ? (
                  <a href={`tel:${vendor.phone}`} className="text-amber-700 hover:underline">
                    {vendor.phone}
                  </a>
                ) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Email</p>
              <p className="text-sm text-stone-700">
                {vendor.email ? (
                  <a href={`mailto:${vendor.email}`} className="text-amber-700 hover:underline">
                    {vendor.email}
                  </a>
                ) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Last Used</p>
              <p className="text-sm text-stone-700">
                {vendor.last_used_at
                  ? new Date(vendor.last_used_at).toLocaleDateString()
                  : "Never"}
              </p>
            </div>
            {vendor.notes && (
              <div className="col-span-2">
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-stone-700">{vendor.notes}</p>
              </div>
            )}
          </div>

          {/* Service log */}
          <div className="p-4 border border-stone-200 rounded-xl">
            <VendorServiceLog vendorId={vendor.id} services={services} />
          </div>
        </>
      )}
    </main>
  );
}
