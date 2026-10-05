"use client";

import { useEffect, useState, startTransition } from "react";
import { Bell, BellDot } from "lucide-react";
import { enablePush, usePushState } from "@/components/now/NotificationsToggle";

function partOfDay(hour: number) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/**
 * "Good afternoon / Mon, Oct 5 · 3 due today" and the bell.
 *
 * Time of day comes from the phone after hydration, so the server's clock (UTC)
 * never greets anyone with the wrong part of the day. The bell carries a dot
 * while this phone has no notifications, and one tap turns them on.
 */
export function HomeHeader({ familyId, dueLine }: { familyId: string; dueLine: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [push, setPush] = usePushState();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startTransition(() => setNow(new Date()));
  }, []);

  const needsPush = push === "off";
  return (
    <header className="mb-3 flex items-start justify-between">
      <div>
        <h1 className="text-xl font-medium text-stone-800">{now ? `Good ${partOfDay(now.getHours())}` : "Hello"}</h1>
        <p className="text-xs text-stone-500" data-testid="home-due-line">
          {now ? now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " · " : ""}
          {dueLine}
        </p>
      </div>
      {push !== "checking" && push !== "unsupported" && (
        <button
          type="button"
          disabled={busy || !needsPush}
          onClick={async () => {
            setBusy(true);
            setPush(await enablePush(familyId));
            setBusy(false);
          }}
          aria-label={needsPush ? "Turn on notifications" : push === "blocked" ? "Notifications blocked in settings" : "Notifications on"}
          title={push === "blocked" ? "Notifications are blocked in this phone's settings" : undefined}
          className="rounded-full p-1.5 text-amber-600 disabled:opacity-100"
          data-testid="home-bell"
        >
          {needsPush ? <BellDot className="h-5 w-5" aria-hidden /> : <Bell className="h-5 w-5" aria-hidden />}
        </button>
      )}
    </header>
  );
}
