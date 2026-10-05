import { describe, expect, it } from "vitest";
import { sendOutbox, type Outbox } from "./push-send";
import { subscriptionRow, urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from "./push";

const msg = (id: string, endpoint: string) => ({
  id, endpoint, p256dh: "k", auth: "a", title: "Feed", body: "Reminder", url: "/now",
});
const vapid = { public: "pub", private: "priv", subject: "mailto:x@example.com" };

describe("push sender", () => {
  it("one dead phone does not stop the others, and its status goes back for cleanup", async () => {
    const outbox: Outbox = { vapid, messages: [msg("1", "https://ok"), msg("2", "https://gone")] };
    const results = await sendOutbox(outbox, async (sub) => {
      if (sub.endpoint === "https://gone") throw { statusCode: 410, body: "expired" };
      return { statusCode: 201 };
    });
    expect(results).toEqual([
      { id: "1", ok: true, status: "201" },
      { id: "2", ok: false, status: "410", error: "expired" },
    ]);
  });

  it("refuses to send unsigned when the vault has no key", async () => {
    const results = await sendOutbox({ vapid: { ...vapid, private: null }, messages: [msg("1", "https://ok")] }, async () => {
      throw new Error("must not be called");
    });
    expect(results[0]).toMatchObject({ ok: false, error: "signing key missing from vault" });
  });

  it("nothing to send means no calls", async () => {
    expect(await sendOutbox({ vapid, messages: [] })).toEqual([]);
  });
});

describe("push subscribe helpers", () => {
  it("the public key decodes to a 65-byte uncompressed P-256 point", () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });

  it("an incomplete subscription is refused", () => {
    expect(() => subscriptionRow({ endpoint: "https://x", keys: { p256dh: "a" } })).toThrow();
    expect(subscriptionRow({ endpoint: "https://x", keys: { p256dh: "a", auth: "b" } })).toEqual({
      endpoint: "https://x", p256dh: "a", auth: "b",
    });
  });
});
