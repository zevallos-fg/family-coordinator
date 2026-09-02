"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { VendorForm } from "@/components/vendors/VendorForm";

export default function NewVendorPage() {
  const router = useRouter();

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/vendors" className="text-sm text-stone-400 hover:text-stone-600">
          ← Vendors
        </Link>
        <h1 className="text-xl font-bold text-stone-800 mt-2">Add Vendor</h1>
      </div>
      <VendorForm
        mode="create"
        onSuccess={(id) => {
          router.push(`/vendors/${id}`);
        }}
      />
    </main>
  );
}
