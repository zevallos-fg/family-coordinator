"use client";

import Link from "next/link";
import { useState } from "react";
import { Mic } from "lucide-react";
import { QuickCaptureSheet } from "@/components/capture/QuickCaptureSheet";

/**
 * "Tell me anything — I'll sort it." The mind dump is the input to every
 * section rather than a section of its own: groceries go to the list, the rest
 * is filed, and what can't be placed waits in the Inbox.
 */
export function CaptureBar({ inboxCount }: { inboxCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="home-capture"
        className="flex w-full items-center gap-2 rounded-full border border-violet-600 bg-stone-100 px-4 py-2.5 text-left active:bg-stone-200"
      >
        <Mic className="h-[18px] w-[18px] text-violet-600" aria-hidden />
        <span className="text-[13px] text-stone-500">Tell me anything — I&apos;ll sort it</span>
      </button>
      {inboxCount > 0 && (
        <Link href="/capture" className="block text-center text-[11px] text-violet-600" data-testid="home-inbox">
          Inbox · {inboxCount} to sort
        </Link>
      )}
      <QuickCaptureSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
