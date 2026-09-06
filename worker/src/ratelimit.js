// Per-user rate limiting, keyed on the verified `sub` from the JWT.
//
// The $10/family/month cap lives in the app and the database. It cannot protect
// this worker, because the worker is reachable directly — the budget check in
// skills/_lib/runner.ts runs before the fetch, so anyone calling the worker URL
// straight bypasses it entirely. This is the proxy's own ceiling.
//
// Deliberately keyed per USER, not per family: the family cap is the DB's job, and
// resolving a family here would mean giving the proxy database access it should
// not have.

/**
 * KV is eventually consistent, so read-modify-write races: two requests landing
 * in the same instant can both read the same count. That makes these limits
 * approximate at the edges — they will not let a runaway loop through, but they
 * are not an accounting boundary. The DB remains the source of truth for spend.
 */
const LIMITS = [
  { name: "minute", windowSeconds: 60, max: 20 },
  { name: "hour", windowSeconds: 60 * 60, max: 200 },
  { name: "day", windowSeconds: 24 * 60 * 60, max: 1000 },
];

export class RateLimitError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message);
    this.status = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Count this request against every window, or throw RateLimitError.
 *
 * If no KV namespace is bound the call fails closed only in production: without
 * a counter there is no ceiling, and an unlimited proxy is the thing we are here
 * to remove. Local dev without KV is allowed so the suite can run.
 */
export async function enforceRateLimit(kv, userId, { allowMissingKv = false } = {}) {
  if (!kv) {
    if (allowMissingKv) return { skipped: true };
    throw new RateLimitError("rate limiter unavailable", 30);
  }

  const now = Math.floor(Date.now() / 1000);

  const states = await Promise.all(
    LIMITS.map(async (limit) => {
      // Fixed window: the bucket id is the window index, so keys expire on their
      // own and no cleanup pass is needed.
      const bucket = Math.floor(now / limit.windowSeconds);
      const key = `rl:${userId}:${limit.name}:${bucket}`;
      const raw = await kv.get(key);
      const count = raw ? parseInt(raw, 10) || 0 : 0;
      const resetsIn = (bucket + 1) * limit.windowSeconds - now;
      return { limit, key, count, resetsIn };
    })
  );

  const exceeded = states.find((s) => s.count >= s.limit.max);
  if (exceeded) {
    throw new RateLimitError(
      `rate limit exceeded: ${exceeded.limit.max} requests per ${exceeded.limit.name}`,
      exceeded.resetsIn
    );
  }

  // Only charge the request once it is known to be allowed by every window.
  await Promise.all(
    states.map((s) =>
      kv.put(s.key, String(s.count + 1), {
        // Outlive the window slightly so a request at the boundary still counts.
        expirationTtl: Math.max(60, s.limit.windowSeconds + 60),
      })
    )
  );

  const tightest = states.reduce((a, b) =>
    a.limit.max - a.count <= b.limit.max - b.count ? a : b
  );
  return {
    skipped: false,
    remaining: tightest.limit.max - tightest.count - 1,
    resetsIn: tightest.resetsIn,
  };
}
