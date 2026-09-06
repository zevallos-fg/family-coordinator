# aged-dust-551a — Anthropic proxy

Eight routes that call the Anthropic API with `ANTHROPIC_KEY` on behalf of the
Next.js app. The key never reaches the browser; the proxy exists so the app can
use it without shipping it.

## Who may call it

Every route requires a **verified Supabase access token** for a real user of the
Family Co AI project. `src/auth.js` verifies it against the project's published
JWKS (ES256, asymmetric), so this worker holds no key material and cannot mint a
token even if fully compromised.

Rejected explicitly, each with a 401:

| Presented | Why it fails |
|---|---|
| nothing | no `Authorization` header |
| `alg: none` | the algorithm allowlist is checked before any key lookup |
| an HS256 token | same — an attacker who has the public key cannot use it to sign |
| the anon key | valid token, but `role=anon`, and this proxy is for people |
| a service-role token | `role` must be exactly `authenticated` |
| another project's token | `iss` must match, and the `kid` must be in our JWKS |
| an expired token | `exp`, with 30s of clock skew |

`/health` is the only unauthenticated route and returns `{ok:true}` and nothing else.

## Ceilings

`model` used to come straight from the request body on seven of the eight routes,
so a caller chose what to spend. Now:

- **model allowlist** — only the three models the app actually uses
- **`max_tokens` cap** — 4096, the highest any skill asks for is 4000
- **per-user rate limit** — 20/min, 200/hour, 1000/day, keyed on the verified `sub`

The $10/family/month cap in `skills/_lib/runner.ts` runs *before* the fetch, so it
never protected this worker; a direct caller bypassed it entirely. These are the
proxy's own ceilings. They are approximate at the edges — KV is eventually
consistent, so two simultaneous requests can read the same counter. The database
remains the source of truth for spend.

## CORS

An allowlist of the Vercel production, branch and preview origins. It previously
echoed whatever `Origin` it was sent, which is the same as having no policy.

This is a browser control only. It stops a random web page from calling the proxy
with a signed-in user's token; it does nothing against `curl`. Authentication is
what protects the key.

## Routes

| Route | Called by |
|---|---|
| `/` | `skills/_lib/runner.ts` — **all 23 skills go through here** |
| the other seven | nothing in `app/` or `skills/`; only the standalone `family-coordinator-v20.html` |

`/` is labelled a v8.4 legacy passthrough in the original source. That label is
wrong: it is the only route the live app uses. It was not removed.

## Setup

```bash
wrangler kv namespace create RATE_LIMIT   # paste the id into wrangler.toml
wrangler secret put ANTHROPIC_KEY
```

`SUPABASE_URL` is a plain var — it is public, and is used only to fetch the JWKS.

## Testing

```bash
npx wrangler dev --env dev --port 8799    # terminal 1
PROXY_URL=http://127.0.0.1:8799 node test/run-tests.mjs
```

No test makes a real Anthropic call. The authenticated cases deliberately ask for a
rejected model, so they prove the request passed authentication and stopped at
validation without spending anything.
