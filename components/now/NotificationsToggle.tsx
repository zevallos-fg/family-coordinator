"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { VAPID_PUBLIC_KEY, pushSupported, subscriptionRow, urlBase64ToUint8Array } from "@/lib/push";

type State = "checking" | "unsupported" | "off" | "on" | "blocked";

/**
 * "Turn on notifications" — one tap, per phone.
 *
 * What it turns on: reminders set with "Remind me", medicine when a dose comes
 * due, and a 7 am summary. Hidden once it is on, so it does not sit on Now
 * forever; shown again if this phone's subscription goes away.
 */
export function NotificationsToggle({ familyId }: { familyId: string }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!pushSupported()) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const row = subscriptionRow(sub.toJSON());
      const supabase = createClient();
      const { error } = await supabase.from("push_subscriptions").insert({ family_id: familyId, ...row });
      // 23505: this phone is already registered — that is success, not a failure.
      if (error && error.code !== "23505") {
        toast.error("Couldn't turn on notifications. Try again?");
        return;
      }
      setState("on");
      toast.success("Notifications on for this phone");
    } catch {
      toast.error("This phone wouldn't allow notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking" || state === "on" || state === "unsupported") return null;

  return (
    <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3" data-testid="notifications-toggle">
      {state === "blocked" ? (
        <p className="text-sm text-amber-900">
          Notifications are blocked for this app. Allow them in your phone&apos;s settings for this
          site to get reminders and medicine alerts.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-amber-900">
            Get reminders, medicine alerts and a 7 am summary on this phone.
          </p>
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy}
            data-testid="notifications-on"
            className="shrink-0 rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Turn on
          </button>
        </div>
      )}
    </section>
  );
}
