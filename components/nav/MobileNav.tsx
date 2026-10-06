"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SpendIndicator } from "./SpendIndicator";
import { InstallPrompt } from "./InstallPrompt";
import { QuickCaptureSheet } from "@/components/capture/QuickCaptureSheet";

// Home, Kids, Plan — the three rooms used daily — plus capture in the middle
// and More. More is grouped the way Home is, so everything has the same address
// in both places.
const PRIMARY = [
  { href: "/home", label: "Home", icon: "M3 11l9-7 9 7M5 10v10h14V10" },
  { href: "/baby", label: "Kids", icon: "M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 005 0M12 3a9 9 0 100 18 9 9 0 000-18z" },
  { href: "/plan", label: "Plan", icon: "M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
];

export const MORE_GROUPS: Array<{ title: string; tone: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Kids & care",
    tone: "text-sky-600",
    items: [
      { href: "/baby", label: "Baby log" },
      { href: "/care", label: "Recovery & meds" },
      { href: "/kids", label: "Profiles & milestones" },
      { href: "/caregiver", label: "Caregiver" },
    ],
  },
  {
    title: "Today",
    tone: "text-amber-600",
    items: [
      { href: "/now", label: "To-dos" },
      { href: "/capture", label: "Notes inbox" },
      { href: "/organized", label: "Organized" },
      { href: "/digest", label: "Digest" },
    ],
  },
  {
    title: "Food",
    tone: "text-amber-600",
    items: [
      { href: "/grocery", label: "Shopping list" },
      { href: "/meal-plans", label: "Meals" },
      { href: "/barcode", label: "Scan barcode" },
      { href: "/receipts", label: "Receipts" },
    ],
  },
  {
    title: "Plan",
    tone: "text-violet-600",
    items: [
      { href: "/plan", label: "Events & prep" },
      { href: "/schedule", label: "Schedule" },
      { href: "/trips", label: "Trips" },
      { href: "/documents", label: "Documents" },
    ],
  },
  {
    title: "Household",
    tone: "text-stone-500",
    items: [
      { href: "/expenses", label: "Expenses" },
      { href: "/vendors", label: "Vendors" },
      { href: "/hurricane", label: "Hurricane" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-stone-200 bg-white px-4">
        <Link href="/home" className="text-base font-bold text-amber-700">
          Family
        </Link>
        <div className="flex items-center gap-2">
          <InstallPrompt />
          <SpendIndicator />
        </div>
      </header>

      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-[68px] left-0 right-0 max-h-[75vh] overflow-y-auto border-t border-stone-200 bg-white px-4 pb-3 pt-3"
            onClick={(e) => e.stopPropagation()}
            data-testid="more-menu"
          >
            <div className="space-y-3">
              {MORE_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className={`mb-1 px-1 text-[11px] font-medium uppercase tracking-wide ${g.tone}`}>{g.title}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {g.items.map((m) => (
                      <Link
                        key={m.href}
                        href={m.href}
                        onClick={() => setMoreOpen(false)}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          isActive(m.href) ? "bg-stone-100 text-stone-800" : "text-stone-600 active:bg-stone-100"
                        }`}
                      >
                        {m.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <form action="/api/auth/signout" method="POST" className="mt-3 border-t border-stone-100 pt-3">
              <button type="submit" className="text-sm text-stone-500">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-stone-200 bg-white pt-1.5"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {PRIMARY.slice(0, 2).map((p) => (
          <Tab key={p.href} {...p} active={isActive(p.href)} />
        ))}

        {/* A button, not a link. The mic starts listening; it does not take you
            to a list of things you have not dealt with yet. */}
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="flex-1 text-center"
          aria-label="Capture"
          data-testid="nav-capture"
        >
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-700 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3" />
            </svg>
          </span>
        </button>

        {PRIMARY.slice(2).map((p) => (
          <Tab key={p.href} {...p} active={isActive(p.href)} />
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex-1 text-center ${moreOpen ? "text-stone-800" : "text-stone-400"}`}
          aria-label="More"
          aria-expanded={moreOpen}
        >
          <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 12h.01M12 12h.01M18 12h.01" />
          </svg>
          <span className="text-[11px]">More</span>
        </button>
      </nav>

      <QuickCaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  );
}

function Tab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex-1 text-center ${active ? "text-stone-800" : "text-stone-400"}`}
    >
      <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="text-[11px]">{label}</span>
    </Link>
  );
}
