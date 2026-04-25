"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SpendIndicator } from "./SpendIndicator";

const ALL_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/capture", label: "Capture" },
  { href: "/organized", label: "Organized" },
  { href: "/grocery", label: "Grocery" },
  { href: "/meal-plans", label: "Meal Plans" },
  { href: "/caregiver", label: "Caregiver" },
  { href: "/receipts", label: "Receipts" },
  { href: "/vendors", label: "Vendors" },
  { href: "/trips", label: "Trips" },
  { href: "/hurricane", label: "Hurricane" },
  { href: "/kids", label: "Kids" },
  { href: "/expenses", label: "Expenses" },
  { href: "/documents", label: "Documents" },
  { href: "/digest", label: "Digest" },
  { href: "/settings", label: "Settings" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const current = ALL_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <nav className="bg-white border-b border-stone-200">
      <div className="flex items-center justify-between px-4 h-14">
        <Link href="/dashboard" className="text-amber-700 font-bold text-base">
          Family
        </Link>

        <div className="flex items-center gap-3">
          <SpendIndicator />
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
            aria-label="Menu"
          >
            {open ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-stone-100 py-2 px-4">
          {current && (
            <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">
              {current.label}
            </p>
          )}
          <div className="grid grid-cols-2 gap-1">
            {ALL_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-amber-100 text-amber-800"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-stone-100">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-sm text-stone-500 hover:text-stone-700"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
