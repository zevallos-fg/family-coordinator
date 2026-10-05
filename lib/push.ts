/**
 * Phone notifications: the browser half.
 *
 * The public key is public by design (it is how the push service recognises
 * this app); its private half lives in Supabase Vault and is only ever used by
 * /api/push/tick. Keep this value in step with the vault's `vapid_public`.
 */
export const VAPID_PUBLIC_KEY =
  "BPrLAFETXxaxCbd3L7NK4iHMGWLAs32rnQOd3GYl5k0vKOzUEhBGt-1kcOnOulOnJS-y8byXdygTlTPl5jgR0ng";

/** The push API wants the key as raw bytes, not base64url text. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The fields a subscription row needs, from the browser's subscription object. */
export function subscriptionRow(sub: PushSubscriptionJSON): { endpoint: string; p256dh: string; auth: string } {
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("incomplete push subscription");
  return { endpoint, p256dh, auth };
}
