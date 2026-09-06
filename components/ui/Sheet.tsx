"use client";

import { useEffect, type ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Shown next to the title, e.g. a live timer or a kid selector. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * A bottom sheet, not a page.
 *
 * The distinction matters on a phone held in one hand: a sheet keeps the screen
 * underneath, costs no navigation, and closes with a downward flick or a tap on
 * the backdrop. A route change loses your place and, on a slow connection, shows
 * a blank screen first.
 *
 * Height is capped at 85vh with the body scrolling inside, so a long list never
 * pushes the close button off screen, and the bottom padding clears the iPhone
 * home indicator the same way MobileNav does.
 */
export function Sheet({ open, onClose, title, aside, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // Freeze the page behind the sheet, otherwise a scroll gesture that starts
    // inside the sheet and runs past its end scrolls the list underneath.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl sm:mb-6 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="text-base font-semibold text-stone-800">{title}</h2>
            {aside}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-lg px-2 py-1 text-xl leading-none text-stone-400 active:bg-stone-100"
          >
            ×
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
