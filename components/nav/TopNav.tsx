"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SpendIndicator } from "./SpendIndicator";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/capture", label: "Capture" },
  { href: "/organized", label: "Organized" },
  { href: "/grocery", label: "Grocery" },
  { href: "/meal-plans", label: "Meal Plans" },
  { href: "/receipts", label: "Receipts" },
  { href: "/caregiver", label: "Caregiver" },
];

export function TopNav() {
  const pathname = usePathname();

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
          {NAV_ITEMS.map((item) => {
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
