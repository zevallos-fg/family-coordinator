import { createClient } from "@/lib/supabase/server";
import { CaptureList } from "@/components/capture/CaptureList";
import Link from "next/link";
import { requireFamily } from "@/lib/auth/current-family";

export default async function CapturePage() {
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: captures } = await supabase
    .from("captures")
    .select("id, text, created_at, voice_transcription, categories(name, icon)")
    .eq("family_id", familyId)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const typedCaptures = (captures ?? []).map((c) => ({
    ...c,
    categories: c.categories as { name: string; icon: string | null } | null,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Capture</h1>
          <p className="text-sm text-stone-400 mt-0.5">Mental dump — voice or text</p>
        </div>
        <Link
          href="/capture/new"
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          + New
        </Link>
      </div>

      {typedCaptures.length > 0 ? (
        <>
          <p className="text-sm text-stone-500">
            {typedCaptures.length} unresolved capture{typedCaptures.length !== 1 ? "s" : ""}
          </p>
          <CaptureList captures={typedCaptures} />
        </>
      ) : (
        <div className="text-center py-12 text-stone-400 bg-white rounded-xl border border-stone-200">
          <p className="text-sm font-medium text-stone-500">All clear!</p>
          <p className="text-xs mt-1">Nothing pending. Add a capture to get started.</p>
          <Link
            href="/capture/new"
            className="mt-3 inline-block text-xs text-amber-600 hover:underline"
          >
            Add capture →
          </Link>
        </div>
      )}
    </div>
  );
}
