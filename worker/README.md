# ShelfCheck Open Food Facts proxy (optional)

A small Cloudflare Worker that sits in front of the Open Food Facts API and:

- **Caches** product/search lookups at Cloudflare's edge for an hour, so repeat
  or popular barcodes don't round-trip to OFF every time.
- **Adds CORS headers** so any origin can call it from the browser.

It's a faithful reverse proxy: it forwards the exact path and query string it
receives to `world.openfoodfacts.org` and returns the response as-is (plus
caching/CORS headers). Only `/api/v2/product/*` and `/api/v2/search` are
allowed through — anything else gets a 404, so this can't be used as an open
proxy for the rest of OFF's API.

This is entirely optional. The app works fine calling Open Food Facts
directly (that's the default) — this exists to demonstrate a small serverless
backend piece, and to shave some latency/load off repeat lookups if you do
deploy it.

## Deploy it

You'll need a (free) Cloudflare account.

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Wrangler will print the deployed URL, e.g. `https://shelfcheck-off-proxy.<your-subdomain>.workers.dev`.

## Point the app at it

Open [`../js/api.js`](../js/api.js) and change the one constant at the top:

```js
const OFF_BASE = "https://shelfcheck-off-proxy.<your-subdomain>.workers.dev";
```

That's the whole integration — every request `api.js` makes already matches
this Worker's expected path/query shape.

## Local development

```bash
npm run dev
```

Runs the Worker locally via `wrangler dev` (prints a `localhost` URL you can
point `OFF_BASE` at temporarily for testing).

## Watching it in production

```bash
npm run tail
```

Streams live logs from the deployed Worker.
