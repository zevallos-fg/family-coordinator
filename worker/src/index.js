// Family Coordinator v20 — Cloudflare Worker
// Routes: / (legacy passthrough v8.4), /parse-grocery, /extract-recipe-url,
//         /extract-recipe-image, /extract-barcode-wrapper,
//         /parse-receipt-photo, /parse-receipt-email, /fetch-html

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const GROCERY_MODEL = "claude-sonnet-4-20250514"; // retained per §2b eval (16/20 fail)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResp(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
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
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
    }

    const path = new URL(request.url).pathname.replace(/\/$/, "") || "/";

    try {
      // Legacy passthrough — v8.4 sends full Anthropic body to root path
      if (path === "/") {
        const body = await request.json();
        const data = await callAnthropic(env.ANTHROPIC_KEY, body);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
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
          model: model || DEFAULT_MODEL,
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
          model: model || DEFAULT_MODEL,
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
          model: model || DEFAULT_MODEL,
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
          model: model || DEFAULT_MODEL,
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
          model: model || DEFAULT_MODEL,
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
      return jsonResp({ error: err.message }, 500, origin);
    }
  },
};
