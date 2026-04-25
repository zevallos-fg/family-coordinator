"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { SpendIndicator } from "./SpendIndicator";

const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/capture", label: "Capture" },
  { href: "/organized", label: "Organized" },
  { href: "/grocery", label: "Grocery" },
  { href: "/meal-plans", label: "Meal Plans" },
  { href: "/caregiver", label: "Caregiver" },
];

const MORE_NAV = [
  { href: "/receipts", label: "Receipts" },
  { href: "/vendors", label: "Vendors" },
  { href: "/trips", label: "Trips" },
  { href: "/hurricane", label: "Hurricane" },
  { href: "/kids", label: "Kids" },
  { href: "/expenses", label: "Expenses" },
  { href: "/documents", label: "Documents" },
  { href: "/digest", label: "Digest" },
];

export function TopNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const moreActive = MORE_NAV.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <nav className="bg-white border-b border-stone-200 px-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
          <Link
            href="/dashboard"
            className="text-amber-700 font-bold text-base whitespace-nowrap mr-3 shrink-0"
          >
            Family
          </Link>
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-amber-100 text-amber-800"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {/* More dropdown */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                moreActive || moreOpen
                  ? "bg-amber-100 text-amber-800"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              More
              <svg
                className={`w-3.5 h-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-stone-200 py-1 z-50">
                {MORE_NAV.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`block px-4 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-amber-50 text-amber-800"
                          : "text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href="/settings"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              pathname === "/settings" || pathname.startsWith("/settings/")
                ? "bg-amber-100 text-amber-800"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            Settings
          </Link>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4">
          <SpendIndicator />
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="text-xs text-stone-500 hover:text-stone-700 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
