// Connector token -> Supabase user, and the access token that binds a request to
// that user. Nothing in this file reads a user id from the request.
//
// This worker holds NO signing secret. It used to mint its own HS256 tokens, which
// meant holding a credential that could also sign role:"service_role" and bypass
// RLS entirely — as powerful as the service-role key it was supposed to avoid, and
// alive only for as long as the project kept legacy HS256 verification enabled
// (sessions are ES256 now).
//
// Instead it holds one REFRESH TOKEN per user, in KV, and exchanges it for a normal
// access token the way any signed-in client does. That credential is scoped to a
// single user, cannot be widened, and Fernando can revoke it by signing her out.

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CONNECTOR_TOKEN_MAP: string;
  /** Per-user refresh tokens and cached access tokens. */
  TOKENS: KVNamespace;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refresh a little before expiry so a call never races the clock. */
const ACCESS_TOKEN_SAFETY_MARGIN_SECONDS = 60;

export class AuthError extends Error {}

// Length-independent comparison. Hashing both sides first means the compare runs
// over fixed-width digests, so neither the token's length nor its first differing
// byte is observable from timing.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Resolve the bearer token to a Supabase auth user id.
 *
 * The map is the ONLY source of user identity. A request cannot name the user it
 * wants to act as: an unmapped token is rejected outright rather than falling back
 * to a default or to anything in the request body.
 */
export async function resolveUserId(
  authorization: string | null,
  tokenMapJson: string
): Promise<string> {
  if (!authorization) throw new AuthError("missing Authorization header");

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) throw new AuthError("Authorization must be 'Bearer <token>'");
  const presented = match[1].trim();
  if (!presented) throw new AuthError("empty bearer token");

  let map: Record<string, string>;
  try {
    map = JSON.parse(tokenMapJson);
  } catch {
    throw new AuthError("connector token map is not valid JSON");
  }

  // Compare against every entry rather than a map lookup, so a miss costs the same
  // as a hit and the loop cannot be short-circuited by a near-miss token.
  let userId: string | null = null;
  for (const [token, mappedUser] of Object.entries(map)) {
    if (await safeEqual(token, presented)) userId = mappedUser;
  }

  if (!userId) throw new AuthError("unrecognised connector token");
  if (!UUID_RE.test(userId)) {
    throw new AuthError("connector token maps to something that is not a user id");
  }
  return userId;
}

const refreshKey = (userId: string) => `refresh:${userId}`;
const accessKey = (userId: string) => `access:${userId}`;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  msg?: string;
}

/**
 * A valid access token for one user.
 *
 * Cached in KV until shortly before it expires, so the refresh token is exchanged
 * rarely rather than on every tool call. That matters because Supabase ROTATES the
 * refresh token on use: each exchange invalidates the previous one, and the new one
 * must be stored or the connector locks itself out.
 */
export async function getAccessToken(userId: string, env: Env): Promise<string> {
  const cached = await env.TOKENS.get(accessKey(userId));
  if (cached) return cached;

  const refreshToken = await env.TOKENS.get(refreshKey(userId));
  if (!refreshToken) {
    throw new AuthError(
      "no refresh token stored for this user. The connector has not been linked, " +
        "or the user has been signed out. Re-run scripts/link-user.mjs."
    );
  }

  const res = await fetch(new URL("/auth/v1/token?grant_type=refresh_token", env.SUPABASE_URL), {
    method: "POST",
    redirect: "error",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const body = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !body.access_token || !body.refresh_token) {
    // A revoked or superseded refresh token lands here. Say so plainly: a silent
    // fall-through would look to the model like an account with no data.
    const detail = body.error_description ?? body.error ?? body.msg ?? `status ${res.status}`;
    throw new AuthError(
      `could not exchange the stored refresh token (${detail}). If the user was ` +
        `signed out, the connector is revoked and must be re-linked.`
    );
  }

  // Store the rotated refresh token BEFORE handing back the access token. If the
  // isolate dies between the exchange and this write, the stored token is already
  // spent and the connector is bricked until re-linked — so this write is the one
  // step that must not be skipped or reordered.
  await env.TOKENS.put(refreshKey(userId), body.refresh_token);

  const ttl = Math.max(
    0,
    (body.expires_in ?? 3600) - ACCESS_TOKEN_SAFETY_MARGIN_SECONDS
  );
  // KV requires expirationTtl >= 60. Below that, skip the cache rather than store
  // something that outlives the token it holds.
  if (ttl >= 60) {
    await env.TOKENS.put(accessKey(userId), body.access_token, { expirationTtl: ttl });
  }

  return body.access_token;
}
