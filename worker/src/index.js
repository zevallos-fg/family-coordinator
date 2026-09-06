// Family Coordinator v20 — Cloudflare Worker
// Routes: / (passthrough, used by skills/_lib/runner.ts), /parse-grocery,
//         /extract-recipe-url, /extract-recipe-image, /extract-barcode-wrapper,
//         /parse-receipt-photo, /parse-receipt-email, /fetch-html
//
// Every route spends ANTHROPIC_KEY. All of them therefore require a verified
// Supabase access token belonging to a real user of this project; see auth.js.
// There is no unauthenticated path other than the CORS preflight and /health.

import { AuthError, verifyAccessToken } from "./auth.js";
import { enforceRateLimit, RateLimitError } from "./ratelimit.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const GROCERY_MODEL = "claude-sonnet-4-20250514"; // retained per §2b eval (16/20 fail)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// The only models this proxy will pay for. Before this list, `model` came
// straight from the request body on seven of the eight routes, so any caller
// could name the most expensive model available to the key.
//
// GROCERY_MODEL is deliberately a different Sonnet from the SONNET_MODEL the app
// uses elsewhere (claude-sonnet-4-6). It stays pinned: the §2b eval result that
// justifies Sonnet for grocery parsing (16/20 fail on Haiku) was measured against
// claude-sonnet-4-20250514, and re-pointing it would invalidate that finding
// without re-running the eval. Flagged, not changed.
const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001", // HAIKU_MODEL in skills/_lib/runner.ts
  "claude-sonnet-4-6", // SONNET_MODEL in skills/_lib/runner.ts
  GROCERY_MODEL,
]);

// Highest max_tokens any skill asks for is 4000 (skills/*/index.ts).
const MAX_TOKENS_CAP = 4096;

const ALLOWED_FETCH_DOMAINS = [
  "nytimes.com", "cooking.nytimes.com", "seriouseats.com", "foodnetwork.com",
  "bonappetit.com", "kingarthurbaking.com", "smittenkitchen.com", "allrecipes.com",
  "epicurious.com", "thekitchn.com", "simplyrecipes.com", "budgetbytes.com",
  "halfbakedharvest.com", "sallysbakingaddiction.com", "cookieandkate.com",
  "minimalistbaker.com", "101cookbooks.com", "skinnytaste.com",
];

// §5c — Named prompt consts. All return strict JSON. Input/output shapes documented.
// Input: {text} → Output: {isGrocery: bool, items: string[]}
const PROMPT_PARSE_GROCERY = (text) =>
  `Analyze this voice/text capture from a parent: "${text}"

Is this a grocery/shopping request? If yes, extract individual item names.

Return ONLY valid JSON. No markdown. No prose. No explanation.
{"isGrocery": true, "items": ["oregano", "chili powder"]}
or
{"isGrocery": false, "items": []}`;

// Input: {html} → Output: {name, baseServings, totalTimeMin, cuisine, dietaryTags, methodSteps, ingredients[]}
const PROMPT_EXTRACT_RECIPE_URL = (html) =>
  `Extract the recipe from this HTML page content.
Return ONLY valid JSON. No markdown. No prose.
{
  "name": "string",
  "baseServings": 4,
  "totalTimeMin": 30,
  "cuisine": "Italian",
  "dietaryTags": ["vegetarian"],
  "methodSteps": "1. Step one. 2. Step two.",
  "ingredients": [
    {"name": "all-purpose flour", "quantity": 2, "unit": "cup", "preparation": "sifted", "isOptional": false}
  ]
}

HTML:
${html.slice(0, 60000)}`;

// Input: image (vision) → Output: same recipe shape
const PROMPT_EXTRACT_RECIPE_IMAGE =
  `This image shows a recipe (cookbook page, screenshot, or handwritten card). Extract it completely.
Return ONLY valid JSON. No markdown. No prose.
{
  "name": "string",
  "baseServings": 4,
  "totalTimeMin": null,
  "cuisine": null,
  "dietaryTags": [],
  "methodSteps": "prose steps",
  "ingredients": [
    {"name": "butter", "quantity": 2, "unit": "tbsp", "preparation": null, "isOptional": false}
  ]
}`;

// Input: image (vision) → Output: {productName, brand, barcode, nutritionPer100g}
const PROMPT_EXTRACT_BARCODE_WRAPPER =
  `This image shows a food product or its packaging/nutrition label.
Extract product name, brand, barcode if visible, and nutrition facts per 100g.
Return ONLY valid JSON. No markdown. No prose.
{
  "productName": "string",
  "brand": "string",
  "barcode": "string or null",
  "nutritionPer100g": {
    "kcal": 0, "protein_g": 0, "carb_g": 0, "fat_g": 0,
    "fiber_g": 0, "sodium_mg": 0, "iron_mg": 0, "folate_ug": 0, "calcium_mg": 0
  }
}`;

// Input: image (vision) → Output: {lineItems: [{name, quantity, unit, price}]}
const PROMPT_PARSE_RECEIPT_PHOTO =
  `This image shows a grocery store receipt. Extract every line item purchased.
Return ONLY valid JSON. No markdown. No prose.
{"lineItems": [{"name": "Whole Milk 1gal", "quantity": 1, "unit": "piece", "price": 4.99}]}`;

// Input: {html|text} → Output: {lineItems: [{name, quantity, unit, price}]}
const PROMPT_PARSE_RECEIPT_EMAIL = (content) =>
  `This is a grocery receipt email. Extract every line item purchased.
Return ONLY valid JSON. No markdown. No prose.
{"lineItems": [{"name": "Organic Eggs", "quantity": 1, "unit": "piece", "price": 6.49}]}

Receipt:
${content.slice(0, 40000)}`;

// Vercel project: family-coordinator, team zevallos-fgs-projects.
// Preview URLs are generated per deployment and per branch, so they are matched
// by shape rather than listed. Both patterns are anchored and pin the team suffix,
// so `family-coordinator-evil.vercel.app` (a project someone else owns) does not
// match.
const ALLOWED_ORIGINS = new Set([
  "https://family-coordinator.vercel.app",
  "https://family-coordinator-git-main-zevallos-fgs-projects.vercel.app",
]);
const PREVIEW_ORIGIN_RE =
  /^https:\/\/family-coordinator-(git-)?[a-z0-9-]+-zevallos-fgs-projects\.vercel\.app$/;
const DEV_ORIGIN_RE = /^http:\/\/localhost:\d+$/;

/**
 * Resolve the origin this response may be shared with, or null.
 *
 * Returning null (rather than "*") for an unrecognised origin is the point: the
 * previous version echoed whatever Origin it was sent, which is the same as
 * having no policy at all.
 *
 * Note this is a browser control only. It stops a random web page from calling
 * the proxy with a signed-in user's token; it does nothing against curl. The
 * bearer check in auth.js is what actually protects the key.
 */
function allowedOrigin(origin, env) {
  if (!origin) return null; // Non-browser caller (the skills runner). No CORS needed.
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (PREVIEW_ORIGIN_RE.test(origin)) return origin;
  if (env?.ALLOW_LOCALHOST_ORIGIN === "true" && DEV_ORIGIN_RE.test(origin)) return origin;
  return null;
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  // Omitted entirely when the origin is not allowed, so the browser blocks it.
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResp(data, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin), ...extraHeaders },
  });
}

/**
 * Validate the model/max_tokens a caller asked for.
 *
 * Applied to the passthrough route and to the named routes alike, because until
 * now both took `model` from the body.
 */
function checkModel(model) {
  const chosen = model || DEFAULT_MODEL;
  if (!ALLOWED_MODELS.has(chosen)) {
    throw new BadRequest(`model not allowed: ${chosen}`);
  }
  return chosen;
}

function checkMaxTokens(maxTokens) {
  if (maxTokens === undefined || maxTokens === null) {
    throw new BadRequest("max_tokens required");
  }
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_CAP) {
    throw new BadRequest(`max_tokens must be an integer between 1 and ${MAX_TOKENS_CAP}`);
  }
  return maxTokens;
}

class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

async function callAnthropic(apiKey, body) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Extracts first {...} block — guards against Haiku prose-append (per §2b finding)
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in response");
  return JSON.parse(match[0]);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Liveness only. Says nothing about configuration, and spends nothing.
    if (request.method === "GET" && path === "/health") {
      return jsonResp({ ok: true }, 200, origin);
    }

    if (request.method !== "POST") {
      return jsonResp({ error: "method not allowed" }, 405, origin);
    }

    // ---- Authentication gate ------------------------------------------------
    // Ahead of routing and ahead of reading the body, so no route can be added
    // later that quietly sits in front of it.
    let caller;
    try {
      caller = await verifyAccessToken(request.headers.get("Authorization"), env.SUPABASE_URL);
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      return jsonResp({ error: err.message }, err.status, origin, {
        "WWW-Authenticate": 'Bearer realm="family-coordinator-proxy"',
      });
    }

    try {
      await enforceRateLimit(env.RATE_LIMIT, caller.userId, {
        allowMissingKv: env.ALLOW_MISSING_KV === "true",
      });
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err;
      return jsonResp({ error: err.message }, 429, origin, {
        "Retry-After": String(err.retryAfterSeconds),
      });
    }

    try {
      // Passthrough — the caller supplies a full Anthropic body.
      //
      // NOT removed, despite being labelled a v8.4 legacy route: this is the only
      // route the live Next.js app uses. skills/_lib/runner.ts posts here, and all
      // 23 skills go through it. Deleting it would take the whole skills layer down.
      //
      // What made it dangerous was that the body was forwarded verbatim, so the
      // caller chose the model and max_tokens. Both are now checked, and the shape
      // is pinned to a messages request rather than passed straight through.
      if (path === "/") {
        const body = await request.json();
        if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
          return jsonResp({ error: "messages array required" }, 400, origin);
        }
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: checkModel(body.model),
          max_tokens: checkMaxTokens(body.max_tokens),
          messages: body.messages,
          ...(body.system ? { system: body.system } : {}),
        });
        return jsonResp(data, 200, origin);
      }

      if (path === "/parse-grocery") {
        const { text } = await request.json();
        if (!text) return jsonResp({ error: "text required" }, 400, origin);
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: GROCERY_MODEL,
          max_tokens: 300,
          messages: [{ role: "user", content: PROMPT_PARSE_GROCERY(text) }],
        });
        return jsonResp(extractJSON(data.content[0].text), 200, origin);
      }

      if (path === "/extract-recipe-url") {
        const { html, model } = await request.json();
        if (!html) return jsonResp({ error: "html required" }, 400, origin);
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: checkModel(model),
          max_tokens: 4000,
          messages: [{ role: "user", content: PROMPT_EXTRACT_RECIPE_URL(html) }],
        });
        try {
          return jsonResp(extractJSON(data.content[0].text), 200, origin);
        } catch {
          return jsonResp({ parseStatus: "needs_review", raw: data.content[0].text }, 200, origin);
        }
      }

      if (path === "/extract-recipe-image") {
        const { imageBase64, mimeType, model } = await request.json();
        if (!imageBase64 || !mimeType) return jsonResp({ error: "imageBase64 and mimeType required" }, 400, origin);
        if (imageBase64.length > MAX_IMAGE_BYTES * 1.37) return jsonResp({ error: "image exceeds 4MB" }, 413, origin);
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: checkModel(model),
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
              { type: "text", text: PROMPT_EXTRACT_RECIPE_IMAGE },
            ],
          }],
        });
        try {
          return jsonResp(extractJSON(data.content[0].text), 200, origin);
        } catch {
          return jsonResp({ parseStatus: "needs_review", raw: data.content[0].text }, 200, origin);
        }
      }

      if (path === "/extract-barcode-wrapper") {
        const { imageBase64, mimeType, model } = await request.json();
        if (!imageBase64 || !mimeType) return jsonResp({ error: "imageBase64 and mimeType required" }, 400, origin);
        if (imageBase64.length > MAX_IMAGE_BYTES * 1.37) return jsonResp({ error: "image exceeds 4MB" }, 413, origin);
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: checkModel(model),
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
              { type: "text", text: PROMPT_EXTRACT_BARCODE_WRAPPER },
            ],
          }],
        });
        try {
          return jsonResp(extractJSON(data.content[0].text), 200, origin);
        } catch {
          return jsonResp({ parseStatus: "needs_review", raw: data.content[0].text }, 200, origin);
        }
      }

      if (path === "/parse-receipt-photo") {
        const { imageBase64, mimeType, model } = await request.json();
        if (!imageBase64 || !mimeType) return jsonResp({ error: "imageBase64 and mimeType required" }, 400, origin);
        if (imageBase64.length > MAX_IMAGE_BYTES * 1.37) return jsonResp({ error: "image exceeds 4MB" }, 413, origin);
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: checkModel(model),
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
              { type: "text", text: PROMPT_PARSE_RECEIPT_PHOTO },
            ],
          }],
        });
        try {
          return jsonResp(extractJSON(data.content[0].text), 200, origin);
        } catch {
          return jsonResp({ parseStatus: "needs_review", raw: data.content[0].text }, 200, origin);
        }
      }

      if (path === "/parse-receipt-email") {
        const { html, text: emailText, model } = await request.json();
        const content = html || emailText;
        if (!content) return jsonResp({ error: "html or text required" }, 400, origin);
        const data = await callAnthropic(env.ANTHROPIC_KEY, {
          model: checkModel(model),
          max_tokens: 2000,
          messages: [{ role: "user", content: PROMPT_PARSE_RECEIPT_EMAIL(content) }],
        });
        try {
          return jsonResp(extractJSON(data.content[0].text), 200, origin);
        } catch {
          return jsonResp({ parseStatus: "needs_review", raw: data.content[0].text }, 200, origin);
        }
      }

      if (path === "/fetch-html") {
        const { url: targetUrl } = await request.json();
        if (!targetUrl) return jsonResp({ error: "url required" }, 400, origin);
        let hostname;
        try { hostname = new URL(targetUrl).hostname.replace(/^www\./, ""); }
        catch { return jsonResp({ error: "invalid url" }, 400, origin); }
        const allowed = ALLOWED_FETCH_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d));
        if (!allowed) return jsonResp({ error: "domain not allowlisted" }, 403, origin);
        const pageRes = await fetch(targetUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible)" } });
        const html = await pageRes.text();
        return jsonResp({ html: html.slice(0, 500000) }, 200, origin);
      }

      return jsonResp({ error: "not found" }, 404, origin);

    } catch (err) {
      // Rejections we raised ourselves carry the status the caller should see.
      // Anything else is ours, and its message is not shown: an upstream error
      // string can carry request detail that does not belong in a client response.
      if (err instanceof BadRequest) return jsonResp({ error: err.message }, 400, origin);
      console.error("proxy failure", path, caller.userId, err);
      return jsonResp({ error: "internal error" }, 500, origin);
    }
  },
};
