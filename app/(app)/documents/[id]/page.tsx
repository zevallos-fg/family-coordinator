import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getDocument(id: string) {
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

  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("family_id", membership.family_id)
    .maybeSingle();

  return { doc, error: error?.message ?? null };
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { doc, error } = await getDocument(id);

  if (!doc && !error) notFound();

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/documents" className="text-sm text-stone-400 hover:text-stone-600">
          ← Documents
        </Link>
        {doc && (
          <h1 className="text-xl font-bold text-stone-800 mt-2">{doc.title}</h1>
        )}
      </div>

      {error && <ErrorBanner userMessage="Could not load document." />}

      {doc && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File preview */}
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            {doc.file_url && doc.doc_type !== "application/pdf" ? (
              <img src={doc.file_url} alt={doc.title} className="w-full h-auto" />
            ) : (
              <div className="p-8 flex flex-col items-center justify-center bg-stone-50">
                <svg className="w-16 h-16 text-stone-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-amber-700 hover:underline"
                >
                  Open document
                </a>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-4">
            <div className="p-4 border border-stone-200 rounded-xl space-y-3">
              <div>
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Type</p>
                <p className="text-sm text-stone-700">{doc.doc_type ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Indexed</p>
                <p className="text-sm text-stone-700">
                  {doc.indexed_at
                    ? new Date(doc.indexed_at).toLocaleDateString()
                    : "Indexing in progress..."}
                </p>
              </div>
              {doc.tags && doc.tags.length > 0 && (
                <div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map((tag: string) => (
                      <span key={tag} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {doc.file_size_bytes && (
                <div>
                  <p className="text-xs text-stone-400 uppercase tracking-wide mb-1">Size</p>
                  <p className="text-sm text-stone-700">
                    {(doc.file_size_bytes / 1024).toFixed(0)} KB
                  </p>
                </div>
              )}
            </div>

            {doc.ocr_text && (
              <div className="p-4 border border-stone-200 rounded-xl">
                <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">Extracted Text</p>
                <p className="text-xs text-stone-600 whitespace-pre-wrap font-mono line-clamp-10">
                  {doc.ocr_text}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
