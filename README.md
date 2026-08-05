# ShelfCheck

[![CI](https://github.com/IlhamSay123/ShelfCheck/actions/workflows/ci.yml/badge.svg)](https://github.com/IlhamSay123/ShelfCheck/actions/workflows/ci.yml)
[![Lighthouse CI](https://github.com/IlhamSay123/ShelfCheck/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/IlhamSay123/ShelfCheck/actions/workflows/lighthouse.yml)

Scan a food barcode with your phone's camera and instantly see whether it's a healthy choice — powered by the [Open Food Facts](https://world.openfoodfacts.org/) database.

No app store, no install step: it's a website that behaves like an app once you add it to your iPhone home screen.

**Live:** https://ilhamsay123.github.io/ShelfCheck/

## Features

- **Camera barcode scanning** — point your phone at an EAN/UPC barcode on any packaged food (uses the rear camera automatically)
- **Manual barcode entry** — fallback for damaged/unreadable barcodes or manual lookup
- **Health verdict** — a clear Healthy / Moderate / Unhealthy call based on the product's official Nutri-Score grade
- **NOVA processing score** — flags ultra-processed foods, even when the Nutri-Score alone looks fine
- **Nutrient traffic lights** — sugar, fat, saturated fat and salt levels per 100g, color-coded (FSA-style thresholds)
- **Ingredients, allergens & additives** — expandable detail sections
- **Diet/allergen profile** — flags conflicts (allergens, vegan/vegetarian/halal/kosher, custom nutrient limits) against your saved profile
- **Daily nutrient log** — "log this" a scanned product against a per-day diary, with running totals
- **Trip mode** — batch-scan a shopping trip and track a running healthy/moderate/unhealthy tally
- **"Why this score" panel** — a plain-language breakdown of exactly what drove each verdict
- **Scan history** — recently scanned products saved on-device (localStorage), tap to revisit
- **Installable PWA** — "Add to Home Screen" on iPhone gives it a real app icon and full-screen launch
- **Works offline for the app shell** — a service worker caches the UI; live product lookups still need a connection

## Why it needs HTTPS hosting

iPhone Safari only allows camera access (`getUserMedia`) on pages served over **HTTPS** (or `localhost`). That's why this needs to be deployed somewhere with a real HTTPS URL rather than opened as a local file.

## Development

No build step for the app itself — it ships as plain ES modules, straight to the browser. The tooling below is dev-only.

```bash
npm install
npm run check   # lint + typecheck + test, same as CI
```

Individually:

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit, checking the JSDoc-typed logic files
npm run test         # Vitest
npm run test:watch  # Vitest in watch mode
```

### Type checking

The app is plain JavaScript with [JSDoc types](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) — no build/transpile step, so what ships is exactly what's reviewed. `// @ts-check` is enabled per-file in the pure-logic modules (`api.js`, `health.js`, `log.js`, `profile.js`, `trip.js`), where types earn their keep. `app.js`/`scanner.js` are DOM-heavy glue code and are intentionally left unchecked — fighting `HTMLElement | null` everywhere there wasn't worth it for a project this size.

### Tests

Vitest covers the pure logic modules — `health.js` (Nutri-Score/NOVA/fallback scoring, the "why this score" breakdown, gauge fill, RI percentages) most thoroughly, plus `log.js`, `trip.js`, and `profile.js`. Nothing DOM- or network-dependent is unit tested; that logic lives in `app.js`/`api.js`/`scanner.js` and is exercised by hand in the browser instead.

## Continuous integration

Three GitHub Actions workflows in [`.github/workflows/`](.github/workflows/):

- **`ci.yml`** — lint + typecheck + test on every push/PR to `main`.
- **`lighthouse.yml`** — audits the live Pages URL with [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) after pushes to `main` (performance/accessibility/best-practices/SEO/PWA scores; config in [`lighthouserc.json`](lighthouserc.json)). Runs against the real deployed HTTPS URL rather than a local static server, since PWA/installability checks need real HTTPS to mean anything.
- **`deploy.yml`** — an Actions-based alternative to the branch-deploy method below (gated on `ci.yml`'s checks passing first). **Not active by default** — it requires the repo's Settings → Pages → Source to be switched to "GitHub Actions"; see [Deploying](#deploying-github-pages--recommended-free-no-extra-account) below for the currently-active method.

## Deploying (GitHub Pages — recommended, free, no extra account)

Once this repo is pushed to GitHub:

1. Go to the repo on GitHub → **Settings → Pages**
2. Under "Build and deployment", set **Source** to `Deploy from a branch`
3. Choose branch `main`, folder `/ (root)`, then **Save**
4. GitHub will publish it at `https://<your-username>.github.io/ShelfCheck/` within a minute or two

Open that URL on your iPhone in Safari, tap the **Share** button, then **Add to Home Screen**. From then on it launches full-screen like a native app.

Prefer GitHub Actions to deploy instead (build status gates the deploy, deploy history shows in the Actions tab)? Switch **Source** to `GitHub Actions` instead in step 2, and `deploy.yml` takes over — it strips out dev-only files (tests, tooling configs, the worker proxy) so only the actual app ships.

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

## Optional: caching proxy

[`worker/`](worker/) is a small Cloudflare Worker that reverse-proxies Open Food Facts with edge caching and CORS. It's entirely optional — the app talks to OFF directly by default — but it's there to demonstrate a minimal serverless backend piece, and to shave latency off repeat lookups if deployed. See [`worker/README.md`](worker/README.md) for setup.

## Project structure

```
index.html            Single-page app shell
css/style.css         Styling (mobile-first, light/dark aware)
js/api.js             Open Food Facts API client (+ Product/Nutriments JSDoc types)
js/health.js          Nutri-Score / NOVA / nutrient verdict logic
js/profile.js         Diet/allergen profile storage + conflict checking
js/log.js             Daily nutrient log
js/trip.js            Shopping trip mode
js/scanner.js         Camera barcode scanning (html5-qrcode)
js/app.js             App state, rendering, history, PWA wiring — imports the modules above
manifest.json         PWA manifest
sw.js                 Service worker (app-shell caching)
icons/                App icons
tests/                Vitest unit tests for the pure-logic modules
worker/               Optional Cloudflare Worker caching proxy for the OFF API
.github/workflows/    CI, Lighthouse CI, and (opt-in) Actions-based Pages deploy
tsconfig.json         JSDoc type-checking config (allowJs/checkJs, no build/emit)
eslint.config.js       ESLint flat config
vitest.config.js       Vitest config
```
