"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { ReceiptUploadForm } from "@/components/receipt/ReceiptUploadForm";
import {
  ReceiptParsePreview,
  type ConfirmedReceiptData,
} from "@/components/receipt/ReceiptParsePreview";
import {
  parseReceiptAction,
  saveReceiptAction,
  type ParsedReceipt,
} from "@/app/(app)/receipts/actions";

type Phase = "upload" | "preview";

export default function NewReceiptPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const imageRef = useRef<{ base64: string; mimeType: string } | null>(null);
  // knownStores fetched on parse (returned from server action indirectly via parse)
  // We store them for the preview step
  const knownStoresRef = useRef<Array<{ id: string; name: string }>>([]);

  async function handleUpload(formData: FormData) {
    setLoading(true);
    try {
      const file = formData.get("receipt") as File;
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      imageRef.current = { base64, mimeType: file.type };

      const result = await parseReceiptAction(formData);
      if (!result.ok || !result.parsed) {
        toast.error(result.error ?? "Failed to parse receipt");
        return;
      }
      setParsed(result.parsed);
      setPhase("preview");
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(data: ConfirmedReceiptData) {
    setSaving(true);
    try {
      const result = await saveReceiptAction({
        ...data,
        imageBase64: imageRef.current?.base64 ?? "",
        imageMimeType: imageRef.current?.mimeType ?? "image/jpeg",
      });
      if (!result.ok) {
        toast.error(result.error ?? "Failed to save receipt");
        return;
      }
      toast.success("Receipt saved!");
      router.push(`/receipts/${result.receiptId}`);
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => (phase === "preview" ? setPhase("upload") : router.back())}
            className="text-stone-400 hover:text-stone-600 text-xl leading-none"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-stone-800">
            {phase === "upload" ? "Add receipt" : "Review items"}
          </h1>
        </div>

        {phase === "upload" && (
          <ReceiptUploadForm onSubmit={handleUpload} loading={loading} />
        )}

        {phase === "preview" && parsed && (
          <ReceiptParsePreview
            parsed={parsed}
            imageBase64={imageRef.current?.base64 ?? ""}
            imageMimeType={imageRef.current?.mimeType ?? "image/jpeg"}
            knownStores={knownStoresRef.current}
            onConfirm={handleConfirm}
            onCancel={() => setPhase("upload")}
            saving={saving}
          />
        )}
      </div>
    </main>
  );
}
