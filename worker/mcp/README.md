# familyco-mcp

A remote MCP server that lets one Claude.ai account write to Family Co AI **as a
specific Supabase user**, with RLS binding every read and write.

## Why not the Supabase MCP

The Supabase MCP authenticates with an account-level PAT, runs as `postgres` with
RLS bypassed, and can reach every project in the org. This server holds no PAT, has
no service-role credential, and is pinned to one project.

## How a request is authorised

```
Claude ──Bearer <connector token>──▶ worker
                                      │  1. connector token → user id   (secret map only)
                                      │  2. exchange her stored refresh token for an access token
                                      │  3. resolve family from membership, as that user
                                      ▼
                                    PostgREST  ── RLS via fn_user_in_family(family_id)
```

Three rules the code enforces:

- **The request never names the user.** Identity comes only from the connector-token
  map. A `user_id` or `family_id` in the tool arguments is ignored.
- **The worker cannot mint a token.** It holds no signing secret — only a refresh
  token per user, which is scoped to that one user and carries no elevated role.
- **`family_id` is resolved server-side** from the caller's own membership, read with
  their own token. A user in two families is refused rather than guessed at.

## Secrets

Set with `wrangler secret put <NAME>`:

| Name | What |
|---|---|
| `SUPABASE_ANON_KEY` | Public anon key. Required as the `apikey` header; on its own it is `role=anon`. |
| `CONNECTOR_TOKEN_MAP` | `{"<connector-token>":"<supabase auth user uuid>"}` |

Never set here, and no code path uses one: service-role key, Supabase PAT, and the
project JWT secret (see *Why not a signing secret* below).

Per-user refresh tokens live in the `TOKENS` KV namespace, not in secrets:

```bash
wrangler kv namespace create TOKENS      # paste the id into wrangler.toml
node scripts/link-user.mjs <email>       # stores refresh:<user-id>, prints a connector token
```

Generate a connector token with real entropy:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Tools

Eight, all append-only. No UPDATE, no DELETE, no SQL passthrough, no schema access.

| Tool | Writes to |
|---|---|
| `remember_fact` | `memory_facts` |
| `remember_decision` | `memory_decisions` |
| `define_term` | `memory_lexicon` |
| `record_correction` | `memory_corrections` |
| `recall` | reads `fn_memory_recall` |
| `whats_due` | reads `v_whats_due` |
| `add_grocery` | `grocery_items` |
| `add_chore` | `maintenance` |

`observed_at`, `decided_at` and `occurred_at` are required and are **never**
defaulted to `now()`. The column comment on `memory_facts.observed_at` is the
reason: it records when the fact became true, not when it was typed, and stamping
it at write time destroys the only timing signal the row carries. A missing value
is an error that tells the model to ask.

### Attribution, and where it does not reach

`written_by = 'claude_chat'` is set on all four memory tables. The actor column
differs per table — `recorded_by_user_id` on facts and corrections,
`decided_by_user_id` on decisions, `confirmed_by_user_id` on lexicon.

`grocery_items` and `maintenance` have **no** `written_by` and no actor column, so
rows from `add_grocery` and `add_chore` are indistinguishable from app-created ones.
Closing that needs a schema change, which is out of scope here.

## Local testing

```bash
cp .dev.vars.example .dev.vars                              # fill in the real values
node scripts/link-user.mjs e2e+fixture@familyco.test --local
npm run dev                                                 # terminal 1
node test/run-tests.mjs                                     # terminal 2
```

The suite probes at startup whether the connector is actually linked, and skips the
write tests with that reason rather than failing as if the code were broken. The
harness uses a service-role key from `.env.local` to read rows back and to mint the
initial session — the worker does not have one and has no code path that could use
one.

## Why not a signing secret

An earlier version minted its own HS256 tokens using the project JWT secret. Two
problems, both fatal:

1. **It was not least privilege.** That secret can sign `role: "service_role"` and
   bypass RLS completely. Holding it is at least as powerful as holding the
   service-role key the design set out to avoid — the hardcoded claims in the signer
   were a convention, not a boundary.
2. **It rested on a deprecated path.** The project has migrated to asymmetric
   signing: real sessions come back ES256 with a `kid`, and the JWKS advertises only
   the EC key. Self-signed HS256 worked only while legacy verification stayed
   enabled, so disabling it in the dashboard — the correct thing to do — would have
   broken this worker without warning.

A refresh token is scoped to one user, cannot be widened, and is revoked by signing
that user out. Rotation is handled on every exchange.
