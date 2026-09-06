"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/skill-action-result";
import type { ActionResult } from "@/lib/skill-action-result";
import { withRetry } from "@/lib/with-retry";
import { run as runIndexer } from "@/skills/family-document-indexer";
import { run as runQA } from "@/skills/family-document-qa";
import type { DocumentMatch } from "@/skills/family-document-qa";
import { lookupFamily } from "@/lib/auth/current-family";

const BUCKET = "family-documents";
const MAX_FILE_SIZE = 26214400; // 25MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

async function getAuthedFamily() {
  const supabase = await createClient();
  const family = await lookupFamily();

  // Three failures, three sentences. The old body collapsed `error || !membership`
  // into "no family found", so a database that could not be reached reported
  // itself as a household that does not exist.
  if (!family.ok) {
    if (family.reason === "unauthenticated") throw new Error("not signed in");
    if (family.reason === "no-family") throw new Error("no family found");
    throw new Error(`could not reach your family record: ${family.message}`);
  }

  return { supabase, userId: family.userId, familyId: family.familyId };
}

export async function uploadDocument(
  file: File,
  metadata?: { title?: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    if (file.size > MAX_FILE_SIZE) {
      return err("invalid_input", "File must be under 25MB.", `file size ${file.size} exceeds limit`);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return err("invalid_input", "Unsupported file type.", `mime ${file.type} not allowed`);
    }

    // Upload to Storage
    const fileName = `${familyId}/${Date.now()}-${file.name}`;
    const { data: upload, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file, { contentType: file.type });

    if (uploadError) {
      Sentry.captureException(uploadError, { extra: { action: "uploadDocument" } });
      return err("upload_error", "Could not upload file.", uploadError.message);
    }

    // Get public-ish URL (signed for private bucket)
    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(upload.path, 3600);

    // Insert document row
    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({
        family_id: familyId,
        uploaded_by_user_id: userId,
        title: metadata?.title ?? file.name,
        file_url: urlData?.signedUrl ?? "",
        file_size_bytes: file.size,
      })
      .select("id")
      .single();

    if (insertError) {
      Sentry.captureException(insertError, { extra: { action: "uploadDocument" } });
      return err("db_error", "Could not save document record.", insertError.message);
    }

    // Trigger indexing asynchronously (fire and forget)
    triggerIndexing(doc.id).catch((e) =>
      Sentry.captureException(e, { extra: { action: "triggerIndexing async" } })
    );

    revalidatePath("/documents");
    return ok({ id: doc.id });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "uploadDocument" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function triggerIndexing(document_id: string): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    const { data: doc } = await supabase
      .from("documents")
      .select("id, file_url, title")
      .eq("id", document_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!doc) return err("not_found", "Document not found.", `doc ${document_id} not in family`);

    // Re-create signed URL for indexing
    const pathMatch = doc.file_url.match(/\/storage\/v1\/object\/sign\/(.*?)\?/);
    const filePath = pathMatch ? pathMatch[1] : null;

    let indexUrl = doc.file_url;
    if (filePath) {
      const { data: newUrl } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath.replace(`${BUCKET}/`, ""), 300);
      if (newUrl) indexUrl = newUrl.signedUrl;
    }

    const skillResult = await withRetry(() =>
      runIndexer(
        {
          document_id,
          file_url: indexUrl,
          family_id: familyId,
          mime_type: "application/pdf", // Default — would normally be stored
          filename: doc.title,
        },
        { familyId, userId }
      )
    );

    if (!skillResult.ok || !skillResult.data) {
      return err("skill_error", "Could not index document.", skillResult.error?.message ?? "indexing failed");
    }

    const { ocr_text, summary, suggested_tags, suggested_doc_type } = skillResult.data;

    // indexed_at is what the UI reads to stop saying "Indexing in progress…".
    // Losing this update left the document in that state permanently while the
    // action reported success.
    const { error: indexError } = await supabase
      .from("documents")
      .update({
        ocr_text,
        tags: suggested_tags,
        doc_type: suggested_doc_type,
        indexed_at: new Date().toISOString(),
      })
      .eq("id", document_id);

    if (indexError) {
      Sentry.captureException(indexError, {
        extra: { action: "triggerIndexing", stage: "persist", document_id },
      });
      return err("db_error", "Indexed the document but could not save the result.", indexError.message);
    }

    revalidatePath("/documents");
    revalidatePath(`/documents/${document_id}`);
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "triggerIndexing", document_id } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function queryDocuments(
  query: string
): Promise<ActionResult<{ matches: DocumentMatch[]; no_match_reason: string | null }>> {
  try {
    const { supabase, familyId, userId } = await getAuthedFamily();

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, title, doc_type, ocr_text, tags")
      .eq("family_id", familyId)
      .not("ocr_text", "is", null);

    if (docsError) {
      return err("db_error", "Could not load documents.", docsError.message);
    }

    const corpus = (docs ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      doc_type: d.doc_type,
      ocr_text: d.ocr_text ?? "",
      tags: d.tags,
      summary: null,
    }));

    const skillResult = await withRetry(() =>
      runQA({ query, document_corpus: corpus }, { familyId, userId })
    );

    if (!skillResult.ok || !skillResult.data) {
      return err("skill_error", "Could not search documents.", skillResult.error?.message ?? "qa failed");
    }

    return ok(skillResult.data);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "queryDocuments" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function getDocument(
  id: string
): Promise<ActionResult<{ doc: Record<string, unknown>; signedUrl: string | null }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (error || !doc) {
      return err("not_found", "Document not found.", `doc ${id} not in family`);
    }

    return ok({ doc: doc as Record<string, unknown>, signedUrl: doc.file_url });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "getDocument" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function updateDocumentMetadata(
  id: string,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const title = (formData.get("title") as string)?.trim();
    const doc_type = (formData.get("doc_type") as string)?.trim() || null;

    const { error } = await supabase
      .from("documents")
      .update({ title, doc_type })
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "updateDocumentMetadata", id } });
      return err("db_error", "Could not update document.", error.message);
    }

    revalidatePath("/documents");
    revalidatePath(`/documents/${id}`);
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "updateDocumentMetadata" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function deleteDocument(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    // Get file path for Storage deletion
    const { data: doc } = await supabase
      .from("documents")
      .select("file_url, title")
      .eq("id", id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (!doc) return err("not_found", "Document not found.", `doc ${id} not in family`);

    // Delete row
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("family_id", familyId);

    if (error) {
      Sentry.captureException(error, { extra: { action: "deleteDocument", id } });
      return err("db_error", "Could not delete document.", error.message);
    }

    revalidatePath("/documents");
    return ok(undefined as void);
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "deleteDocument" } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}

export async function getDocumentIndexingStatus(
  document_id: string
): Promise<ActionResult<{ indexed_at: string | null; tags: string[] | null }>> {
  try {
    const { supabase, familyId } = await getAuthedFamily();

    const { data, error } = await supabase
      .from("documents")
      .select("indexed_at, tags")
      .eq("id", document_id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (error) return err("db_error", "Could not fetch document status.", error.message);
    if (!data) return err("not_found", "Document not found.", `id: ${document_id}`);

    return ok({ indexed_at: data.indexed_at ?? null, tags: data.tags ?? null });
  } catch (error) {
    Sentry.captureException(error, { extra: { action: "getDocumentIndexingStatus", document_id } });
    return err("unknown", "An unexpected error occurred.", String(error));
  }
}
