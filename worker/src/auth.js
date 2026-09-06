// Supabase JWT verification for the Anthropic proxy.
//
// Every route behind this file spends ANTHROPIC_KEY, so the only question that
// matters is "is this a real signed-in user of THIS project?". That is answered
// by verifying the caller's Supabase access token against the project's published
// JWKS — no shared secret is held here, and nothing about the caller's identity is
// taken from the request body or from a header the caller controls.
//
// The project signs sessions with ES256 (asymmetric). We verify with the public
// key only, so this worker cannot mint a token even if it is fully compromised.

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only asymmetric signing is accepted. Naming the algorithm explicitly is what
// closes the classic JWT confusion attack: a token claiming "none" or "HS256"
// (which an attacker could forge from the public key) never reaches a verify call.
const ALLOWED_ALG = "ES256";

const JWKS_TTL_MS = 10 * 60 * 1000;
// A token with an unknown kid triggers at most one refetch in this window, so a
// stream of forged kids cannot turn verification into an outbound request flood.
const JWKS_MIN_REFETCH_MS = 60 * 1000;

/** Module-scope, so it survives between requests on a warm isolate. */
let jwksCache = { keys: null, fetchedAt: 0 };

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJSON(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function loadJWKS(supabaseUrl, force = false) {
  const now = Date.now();
  const age = now - jwksCache.fetchedAt;
  if (!force && jwksCache.keys && age < JWKS_TTL_MS) return jwksCache.keys;
  if (force && age < JWKS_MIN_REFETCH_MS && jwksCache.keys) return jwksCache.keys;

  // "manual" rather than "error": the Workers runtime does not implement
  // redirect:"error", so a redirect is caught by checking the status instead.
  // Following one would mean fetching signing keys from a host we did not choose.
  const res = await fetch(new URL("/auth/v1/.well-known/jwks.json", supabaseUrl), {
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    if (jwksCache.keys) return jwksCache.keys;
    throw new AuthError("identity provider redirected the JWKS request", 503);
  }
  if (!res.ok) {
    // Serve a stale copy rather than locking every user out over a blip, but never
    // fall back to "no verification".
    if (jwksCache.keys) return jwksCache.keys;
    throw new AuthError("cannot reach the identity provider", 503);
  }
  const body = await res.json();
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    if (jwksCache.keys) return jwksCache.keys;
    throw new AuthError("identity provider published no keys", 503);
  }
  jwksCache = { keys: body.keys, fetchedAt: now };
  return jwksCache.keys;
}

async function importKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

/**
 * Verify a Supabase access token and return the caller's identity.
 *
 * Throws AuthError on anything less than a fully valid token. There is no path
 * that returns a partial or anonymous identity: a caller is either a verified
 * user of this project or is refused.
 */
export async function verifyAccessToken(authorization, supabaseUrl) {
  if (!authorization) throw new AuthError("missing Authorization header");
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!m) throw new AuthError("Authorization must be 'Bearer <token>'");

  const parts = m[1].trim().split(".");
  if (parts.length !== 3) throw new AuthError("malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = b64urlToJSON(headerB64);
    payload = b64urlToJSON(payloadB64);
  } catch {
    throw new AuthError("malformed token");
  }

  if (header.alg !== ALLOWED_ALG) {
    throw new AuthError(`unsupported token algorithm: ${header.alg}`);
  }
  if (!header.kid) throw new AuthError("token has no key id");

  let keys = await loadJWKS(supabaseUrl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Unknown kid usually means the project rotated its signing key.
    keys = await loadJWKS(supabaseUrl, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new AuthError("token signed by an unknown key");
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new AuthError("unexpected key type for ES256");
  }

  const sig = b64urlToBytes(sigB64);
  // ES256 signatures are raw r||s, which is exactly what Web Crypto expects.
  if (sig.length !== 64) throw new AuthError("malformed signature");

  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    await importKey(jwk),
    sig,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) throw new AuthError("bad token signature");

  // Signature checked; now the claims. A valid signature over an expired or
  // foreign-issuer token is still a token we must refuse.
  const now = Math.floor(Date.now() / 1000);
  const skew = 30;
  if (typeof payload.exp !== "number" || payload.exp + skew < now) {
    throw new AuthError("token expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf - skew > now) {
    throw new AuthError("token not yet valid");
  }

  const expectedIss = new URL("/auth/v1", supabaseUrl).toString();
  if (payload.iss !== expectedIss) {
    throw new AuthError("token issued by another project");
  }

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes("authenticated")) throw new AuthError("token is not an end-user token");
  // Refuse service_role and anon explicitly: neither is a person, and this proxy
  // exists to spend one person's quota.
  if (payload.role !== "authenticated") {
    throw new AuthError(`token role '${payload.role}' may not use this proxy`);
  }
  if (typeof payload.sub !== "string" || !UUID_RE.test(payload.sub)) {
    throw new AuthError("token has no usable subject");
  }

  return { userId: payload.sub, email: payload.email ?? null, expiresAt: payload.exp };
}
