# Moving connector tokens from a secret into KV

One-time runbook. Delete this file and `scripts/backfill-token.mjs` once it is done.

## Why the order matters

The new worker resolves a token by looking up `token:<sha256>` in KV. Tokens minted
under the old scheme have **no such key**. Deploy first and both connectors 401
until the backfill runs — which, given how many times these have been reconnected
already, is the one outcome worth designing against.

So: **backfill, verify, deploy, verify, then delete the secret.** Nothing in the
middle of that sequence breaks the live connectors. The old worker ignores the new
KV keys entirely, so step 1 is invisible until step 3.

## 1. Backfill the two tokens people already hold

No reconnection. This writes only the token half; `refresh:` entries are already
correct and are left alone.

```powershell
Set-Location C:\Users\FernZ\family-coordinator\worker\mcp

# You — paste your token at the prompt; it is not echoed and not an argument.
op run --env-file=..\..\.env.op -- node scripts/backfill-token.mjs a4b2af94-06f5-4a25-b84f-aecb89da9191

# Yenny
op run --env-file=..\..\.env.op -- node scripts/backfill-token.mjs f07ccae9-3fa7-4342-8348-37e1c6128f81
```

The script refuses anything that is not 43 base64url characters, so a paste error
becomes an error message rather than a live credential.

## 2. Verify the keys exist, before anything depends on them

```powershell
op run --env-file=..\..\.env.op -- npx wrangler kv key list --binding TOKENS --remote
```

Expect six keys: two `token:<64 hex>`, two `tokenkey:<uuid>`, two `refresh:<uuid>`.
If there are fewer than two `token:` keys, **stop** — deploying now would lock out
whoever is missing.

## 3. Deploy

```powershell
op run --env-file=..\..\.env.op -- npx wrangler deploy
```

## 4. Verify both directions, before touching claude.ai

```powershell
$url  = "https://familyco-mcp.zevallos-fg.workers.dev/"
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

function Test-Token([string]$t, [string]$label) {
  $r = Invoke-WebRequest -Uri $url -Method Post -SkipHttpErrorCheck `
    -Headers @{ Authorization = "Bearer $t"; "Content-Type" = "application/json" } -Body $body
  $n = if ($r.StatusCode -eq 200) { ($r.Content | ConvertFrom-Json).result.tools.Count } else { 0 }
  "{0,-22} status={1} tools={2}" -f $label, $r.StatusCode, $n
}
```

Run `Test-Token` with each live token — both must print `status=200 tools=9` — and
once with any string that was never minted, which must print `status=401 tools=0`.

Neither of you should need to reconnect. The tokens in claude.ai are unchanged;
only where the worker looks them up has moved.

## 5. Delete the secret

Only after step 4 passes for both people. Until it is deleted the map is dead
weight that still reads like configuration:

```powershell
op run --env-file=..\..\.env.op -- npx wrangler secret delete CONNECTOR_TOKEN_MAP
op run --env-file=..\..\.env.op -- npx wrangler secret list
```

`SUPABASE_ANON_KEY` should be the only secret left.

## Rolling back

Redeploy the previous version. The old worker reads `CONNECTOR_TOKEN_MAP`, which is
untouched until step 5 — so a rollback before step 5 needs nothing else. After step
5 it also needs the secret set again, which means having the tokens to hand; that
is the reason step 5 is last and separate rather than folded into the deploy.

## What changes afterwards

`link-user.mjs` is the single writer of everything a linked user consists of. It
mints the token, revokes the previous one, and writes all four keys. There is no
longer a printed instruction for a human to carry to a secret — which is the whole
point, because that carry is what drifted.
