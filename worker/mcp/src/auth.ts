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
  /** Connector tokens, per-user refresh tokens, and cached access tokens. */
  TOKENS: KVNamespace;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refresh a little before expiry so a call never races the clock. */
const ACCESS_TOKEN_SAFETY_MARGIN_SECONDS = 60;

export class AuthError extends Error {}

/**
 * KV key for a connector token.
 *
 * The token is HASHED into the key rather than used as one. KV key names are
 * returned in full by `wrangler kv key list`, so a raw-token key would put every
 * live credential in the output of a read-only listing — worse than the secret it
 * replaces. A SHA-256 digest is not reversible and is just as good a lookup key.
 */
async function tokenKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `token:${hex}`;
}

/**
 * Resolve the bearer token to a Supabase auth user id.
 *
 * KV is the ONLY source of user identity. A request cannot name the user it wants
 * to act as: a token with no KV entry is rejected outright rather than falling
 * back to a default or to anything in the request body.
 *
 * This used to read a JSON map held as a Worker secret. The map was written by
 * hand from a value `link-user.mjs` printed, while the same script wrote the
 * user's refresh token to KV itself — so one half of a linked user was automatic
 * and the other was a manual step in a console scroll-back. They drifted, exactly
 * as that arrangement invites: a family member ended up holding a correctly
 * formed token the gate had never heard of, because a second run of the script
 * had minted a new one and the map still held the first. `link-user.mjs` is now
 * the single writer of both halves.
 */
export async function resolveUserId(authorization: string | null, env: Env): Promise<string> {
  if (!authorization) throw new AuthError("missing Authorization header");

  // The `Bearer ` prefix is optional.
  //
  // RFC 6750 requires it and every well-behaved client sends it — curl, the
  // acceptance suite, mcp-remote and Claude Desktop all do. Claude.ai's connector
  // does not: it sends `Authorization: <token>` with no scheme at all. Requiring
  // the prefix meant every authenticated call from it was refused, which is why
  // the connector reported "connected" (discovery and initialize are
  // unauthenticated and succeeded) and then showed an empty tool list forever.
  //
  // Accepting both costs nothing in security. Either framing produces the same
  // lookup key; a credential has a KV entry or it does not, and how it was framed
  // changes neither.
  const raw = authorization.trim();
  const withScheme = /^Bearer[ 	]+(.*)$/i.exec(raw);
  const presented = (withScheme ? withScheme[1] : raw).trim();
  if (!presented) throw new AuthError("empty Authorization header");

  // A single lookup by digest, where the old code compared against every entry in
  // constant time. That loop existed so a near-miss could not be distinguished
  // from a miss by timing; a hash lookup gives that away for free, because the
  // work done is identical whatever the token is. What remains observable is hit
  // versus miss, which the response states outright anyway.
  const userId = await env.TOKENS.get(await tokenKey(presented));

  // Deliberately the same message whether the token was never minted, was minted
  // for another deployment, or has been revoked by deleting its key. A caller who
  // is not recognised learns that and nothing else.
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
  /** What the gateway returns for a bad apikey, e.g. "Invalid API key". */
  message?: string;
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
    // The Workers runtime does not implement redirect:"error"; a redirect is
    // caught by status below rather than followed with the refresh token attached.
    redirect: "manual",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (res.status >= 300 && res.status < 400) {
    throw new AuthError("token endpoint redirected; refusing to follow");
  }

  const body = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !body.access_token || !body.refresh_token) {
    // A revoked or superseded refresh token lands here. Say so plainly: a silent
    // fall-through would look to the model like an account with no data.
    // `message` is in this list because of the case that hid itself: a wrong
    // SUPABASE_ANON_KEY makes the gateway answer 401 {"message":"Invalid API
    // key"}, which has none of the other three fields — so the detail collapsed
    // to "status 401" and read exactly like a revoked refresh token. The cause
    // was a bad secret and the message pointed at the user's session.
    const detail =
      body.error_description ?? body.error ?? body.msg ?? body.message ?? `status ${res.status}`;
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
