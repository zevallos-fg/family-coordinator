"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SpendIndicator } from "./SpendIndicator";
import { InstallPrompt } from "./InstallPrompt";

// Four destinations plus capture. Everything the schema supports but the family
// does not open daily lives behind "More" — the previous 16-item flat grid meant
// most taps landed on an empty screen.
const PRIMARY = [
  { href: "/now", label: "Now", icon: "M4 6h16M4 12h10M4 18h7" },
  { href: "/grocery", label: "Buy", icon: "M3 3h2l2 12h10l2-8H7" },
  { href: "/meal-plans", label: "Meals", icon: "M5 3v18M5 8h4V3M15 3c-1 2-1 5 0 7v11" },
];

const MORE = [
  { href: "/organized", label: "Organized" },
  { href: "/schedule", label: "Schedule" },
  { href: "/caregiver", label: "Caregiver" },
  { href: "/kids", label: "Kids" },
  { href: "/documents", label: "Documents" },
  { href: "/expenses", label: "Expenses" },
  { href: "/receipts", label: "Receipts" },
  { href: "/vendors", label: "Vendors" },
  { href: "/trips", label: "Trips" },
  { href: "/hurricane", label: "Hurricane" },
  { href: "/digest", label: "Digest" },
  { href: "/settings", label: "Settings" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-stone-200 bg-white px-4">
        <Link href="/now" className="text-base font-bold text-amber-700">
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
            className="absolute bottom-[68px] left-0 right-0 border-t border-stone-200 bg-white px-4 pb-3 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-2 gap-1">
              {MORE.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMoreOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm ${
                    isActive(m.href)
                      ? "bg-amber-100 text-amber-800"
                      : "text-stone-600 active:bg-stone-100"
                  }`}
                >
                  {m.label}
                </Link>
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

        <Link href="/capture" className="flex-1 text-center" aria-label="Capture">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-700 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3" />
            </svg>
          </span>
        </Link>

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
