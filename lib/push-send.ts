import webpush from "web-push";

export interface OutboxMessage {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string | null;
  url: string | null;
}

export interface Outbox {
  vapid: { public: string | null; private: string | null; subject: string };
  messages: OutboxMessage[];
}

export interface SendResult {
  id: string;
  ok: boolean;
  status?: string;
  error?: string;
}

type Sender = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number }
) => Promise<{ statusCode: number }>;

/**
 * Send every claimed message and report each outcome. One failed phone never
 * stops the others; the outcome per message goes back to fn_push_ack, which
 * drops subscriptions the push service says are gone (404/410).
 */
export async function sendOutbox(outbox: Outbox, send: Sender = webpush.sendNotification as unknown as Sender): Promise<SendResult[]> {
  const { vapid, messages } = outbox;
  if (!messages.length) return [];
  if (!vapid.public || !vapid.private) {
    return messages.map((m) => ({ id: m.id, ok: false, error: "signing key missing from vault" }));
  }
  const vapidDetails = { subject: vapid.subject, publicKey: vapid.public, privateKey: vapid.private };
  return Promise.all(
    messages.map(async (m): Promise<SendResult> => {
      try {
        const res = await send(
          { endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } },
          JSON.stringify({ title: m.title, body: m.body ?? "", url: m.url ?? "/now", tag: m.id }),
          // An hour: a reminder that arrives later than that is noise, not help.
          { vapidDetails, TTL: 3600 }
        );
        return { id: m.id, ok: true, status: String(res.statusCode) };
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        return {
          id: m.id,
          ok: false,
          status: err.statusCode ? String(err.statusCode) : undefined,
          error: (err.body || err.message || "send failed").slice(0, 300),
        };
      }
    })
  );
}
