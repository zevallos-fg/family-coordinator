import { createClient } from "@supabase/supabase-js";
import { sendOutbox, type Outbox } from "@/lib/push-send";

export const dynamic = "force-dynamic";

/**
 * Woken every five minutes by pg_cron (job `push-tick`), which sends the tick
 * secret from Supabase Vault in the body.
 *
 * This route holds no credential. It cannot check the secret itself — it hands
 * it to fn_push_outbox, which compares it against Vault and refuses anything
 * else. A request without the right secret gets nothing back and sends nothing.
 * The anon key used here is the public one the browser already has.
 */
export async function POST(request: Request) {
  let secret: unknown;
  try {
    secret = ((await request.json()) as { secret?: unknown }).secret;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof secret !== "string" || secret.length < 20) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.rpc("fn_push_outbox", { p_secret: secret });
  if (error) {
    // 42501 is a wrong secret. Anything else is worth seeing in the logs.
    const forbidden = error.code === "42501";
    if (!forbidden) console.error("[push/tick] outbox failed", error.message);
    return Response.json({ error: forbidden ? "forbidden" : "outbox failed" }, { status: forbidden ? 403 : 500 });
  }

  const outbox = data as unknown as Outbox;
  const results = await sendOutbox(outbox);
  if (results.length) {
    const { error: ackError } = await supabase.rpc("fn_push_ack", {
      p_secret: secret,
      p_results: results as never,
    });
    if (ackError) console.error("[push/tick] ack failed", ackError.message);
  }
  return Response.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
