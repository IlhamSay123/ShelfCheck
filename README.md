# ShelfCheck

Scan a food barcode with your phone's camera and instantly see whether it's a healthy choice — powered by the [Open Food Facts](https://world.openfoodfacts.org/) database.

No app store, no install step: it's a website that behaves like an app once you add it to your iPhone home screen.

## Features

- **Camera barcode scanning** — point your phone at an EAN/UPC barcode on any packaged food (uses the rear camera automatically)
- **Manual barcode entry** — fallback for damaged/unreadable barcodes or manual lookup
- **Health verdict** — a clear Healthy / Moderate / Unhealthy call based on the product's official Nutri-Score grade
- **NOVA processing score** — flags ultra-processed foods, even when the Nutri-Score alone looks fine
- **Nutrient traffic lights** — sugar, fat, saturated fat and salt levels per 100g, color-coded (FSA-style thresholds)
- **Ingredients, allergens & additives** — expandable detail sections
- **Scan history** — recently scanned products saved on-device (localStorage), tap to revisit
- **Installable PWA** — "Add to Home Screen" on iPhone gives it a real app icon and full-screen launch
- **Works offline for the app shell** — a service worker caches the UI; live product lookups still need a connection

## Why it needs HTTPS hosting

iPhone Safari only allows camera access (`getUserMedia`) on pages served over **HTTPS** (or `localhost`). That's why this needs to be deployed somewhere with a real HTTPS URL rather than opened as a local file.

## Deploying (GitHub Pages — recommended, free, no extra account)

Once this repo is pushed to GitHub:

1. Go to the repo on GitHub → **Settings → Pages**
2. Under "Build and deployment", set **Source** to `Deploy from a branch`
3. Choose branch `main`, folder `/ (root)`, then **Save**
4. GitHub will publish it at `https://<your-username>.github.io/ShelfCheck/` within a minute or two

Open that URL on your iPhone in Safari, tap the **Share** button, then **Add to Home Screen**. From then on it launches full-screen like a native app.

### Alternatives

- **Netlify**: drag-and-drop this folder at [app.netlify.com/drop](https://app.netlify.com/drop), or connect the GitHub repo for auto-deploys on push.
- **Vercel**: `vercel` CLI or import the GitHub repo at [vercel.com/new](https://vercel.com/new) — no build settings needed, it's a static site.

Any static host works — there's no backend/server, no build step, and no API keys required.

## Running locally

No build tools needed. Any static file server works, e.g.:

```bash
npx serve .
```

Then open the printed `http://localhost:...` URL. Camera scanning works on `localhost` even without HTTPS; manual barcode entry always works.

## How the health verdict works

1. If Open Food Facts provides a **Nutri-Score** (A–E) for the product, that's used directly: A/B → Healthy, C → Moderate, D/E → Unhealthy.
2. If a product is **NOVA group 4** (ultra-processed), a "Healthy" verdict is automatically downgraded to "Moderate" — a good Nutri-Score doesn't fully offset heavy processing.
3. If no Nutri-Score exists for the product, ShelfCheck falls back to counting how many of sugar/fat/saturated fat/salt are "high" per FSA thresholds (per 100g).

Try scanning barcode `3017620422003` (Nutella) or `5449000000996` (Coca-Cola) to see it in action, or use manual entry with those codes.

## Project structure

```
index.html         Single-page app shell
css/style.css       Styling (mobile-first, light/dark aware)
js/api.js           Open Food Facts API client
js/health.js        Nutri-Score / NOVA / nutrient verdict logic
js/scanner.js        Camera barcode scanning (html5-qrcode)
js/app.js            App state, rendering, history, PWA wiring
manifest.json        PWA manifest
sw.js                 Service worker (app-shell caching)
icons/                App icons
```
