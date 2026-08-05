// ShelfCheck's optional caching reverse-proxy in front of Open Food Facts.
//
// Mirrors OFF's own path + query shape 1:1 (see ../../js/api.js's OFF_BASE
// constant), so pointing the frontend at this once deployed is a one-line
// change — no request-building logic changes on either side.
//
// Why this exists: OFF is public and keyless, so there's nothing to hide here.
// The value is edge caching (product/search lookups repeat a lot — popular
// barcodes, common categories) and CORS headers for browser callers.

const UPSTREAM = "https://world.openfoodfacts.org";

// Only these two endpoints are ever called by the app — anything else is refused
// rather than turning this into an open proxy for the rest of OFF's API surface.
const ALLOWED_PATH_PREFIXES = ["/api/v2/product/", "/api/v2/search"];

const CACHE_TTL_SECONDS = 60 * 60; // Nutri-Score/NOVA data doesn't change minute to minute.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept"
};

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    if (!ALLOWED_PATH_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    // Cloudflare's edge cache is keyed by request URL; the query string (fields=,
    // categories_tags=, etc.) is part of that URL, so different lookups naturally
    // get different cache entries.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);

    const cached = await cache.match(cacheKey);
    if (cached) {
      return withCors(cached);
    }

    const upstreamResponse = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { Accept: "application/json" }
    });

    const response = new Response(upstreamResponse.body, upstreamResponse);
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
    applyCors(response.headers);

    if (upstreamResponse.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  }
};

function applyCors(headers) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
}

function withCors(response) {
  const headers = new Headers(response.headers);
  applyCors(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
