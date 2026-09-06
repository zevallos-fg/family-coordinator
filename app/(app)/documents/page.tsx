import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { DocumentVaultView } from "@/components/documents/DocumentVaultView";
import { requireFamily } from "@/lib/auth/current-family";

async function getDocuments() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, doc_type, tags, file_url, indexed_at, file_size_bytes, created_at")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });

  return { docs: docs ?? [], error: error?.message ?? null };
}

export default async function DocumentsPage() {
  const { docs, error } = await getDocuments();

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Documents</h1>
        <p className="text-sm text-stone-400 mt-1">
          Insurance cards, medical records, tax forms, and more.
        </p>
      </div>

      {error && <ErrorBanner userMessage="Could not load documents." />}

      <DocumentVaultView docs={docs} />

      {!error && docs.length === 0 && (
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          title="No documents yet"
          description="Upload insurance cards, medical records, tax forms, and other important family documents."
        />
      )}
    </main>
  );
}
