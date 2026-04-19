import Link from "next/link";
import { CaptureForm } from "@/components/capture/CaptureForm";

export default function NewCapturePage() {
  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/capture" className="text-sm text-stone-400 hover:text-stone-600">
          ← Capture
        </Link>
        <h1 className="text-xl font-semibold text-stone-800">New capture</h1>
      </div>

      <CaptureForm />

      <p className="text-xs text-stone-400 text-center">
        Grocery items (e.g. &quot;need milk and eggs&quot;) are automatically sent to your grocery list.
        Everything else lands in Organized.
      </p>
    </div>
  );
}
