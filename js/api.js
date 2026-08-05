// @ts-check
// Open Food Facts API wrapper
//
// Points directly at Open Food Facts by default. The optional caching proxy in
// worker/ mirrors OFF's own path/query shape (see worker/src/index.js), so once
// deployed, swapping this one constant to your Worker's URL is the whole change.
const OFF_BASE = "https://world.openfoodfacts.org";

/**
 * @typedef {Object} Nutriments
 * @property {number|null} energyKcal
 * @property {number|null} fat
 * @property {number|null} saturatedFat
 * @property {number|null} sugars
 * @property {number|null} salt
 * @property {number|null} fiber
 * @property {number|null} proteins
 */

/**
 * @typedef {Object} Product
 * @property {string} barcode
 * @property {string} name
 * @property {string} brand
 * @property {string} quantity
 * @property {string} servingSize
 * @property {string} image
 * @property {string} nutriscoreGrade
 * @property {number|null} novaGroup
 * @property {Nutriments} nutriments
 * @property {Nutriments} servingNutriments
 * @property {string} ingredientsText
 * @property {string[]} allergens
 * @property {string[]} allergenTags
 * @property {string[]} ingredientsAnalysisTags
 * @property {string[]} labelTags
 * @property {string[]} additives
 * @property {string[]} categoriesTags
 * @property {number} scannedAt
 */

/**
 * @typedef {Object} AlternativeProduct
 * @property {string} barcode
 * @property {string} name
 * @property {string} brand
 * @property {string} image
 * @property {string} nutriscoreGrade
 */

const OFF_FIELDS = [
  "product_name", "brands", "quantity", "serving_size",
  "image_front_small_url", "image_url", "image_small_url",
  "nutriscore_grade", "nutrition_grades",
  "nova_group",
  "nutriments",
  "ingredients_text",
  "allergens", "allergens_tags",
  "ingredients_analysis_tags",
  "labels_tags",
  "additives_tags",
  "categories_tags"
].join(",");

/**
 * @param {string} barcode
 * @returns {Promise<Product>}
 */
export async function fetchProductByBarcode(barcode) {
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;

  let res;
  try {
    res = await fetch(url, { headers: { "Accept": "application/json" } });
  } catch (e) {
    throw new Error("Network error — check your connection and try again.", { cause: e });
  }

  if (!res.ok) {
    throw new Error(`Lookup failed (server returned ${res.status}).`);
  }

  const data = await res.json();

  if (data.status !== 1 || !data.product) {
    /** @type {Error & {notFound?: boolean}} */
    const err = new Error("Product not found in the Open Food Facts database.");
    err.notFound = true;
    throw err;
  }

  return normalizeProduct(data.product, barcode);
}

/**
 * @param {any} p Raw Open Food Facts product object.
 * @param {string} barcode
 * @returns {Product}
 */
function normalizeProduct(p, barcode) {
  const n = p.nutriments || {};
  return {
    barcode,
    name: p.product_name || "Unknown product",
    brand: p.brands || "",
    quantity: p.quantity || "",
    servingSize: p.serving_size || "",
    image: p.image_front_small_url || p.image_small_url || p.image_url || "",
    nutriscoreGrade: (p.nutriscore_grade || p.nutrition_grades || "").toLowerCase(),
    novaGroup: p.nova_group || null,
    nutriments: {
      energyKcal: pick(n["energy-kcal_100g"], n["energy-kcal"]),
      fat: pick(n["fat_100g"]),
      saturatedFat: pick(n["saturated-fat_100g"]),
      sugars: pick(n["sugars_100g"]),
      salt: pick(n["salt_100g"]),
      fiber: pick(n["fiber_100g"]),
      proteins: pick(n["proteins_100g"])
    },
    // Per-serving values (used for logging), null when OFF has no serving data for this product
    servingNutriments: {
      energyKcal: pick(n["energy-kcal_serving"]),
      fat: pick(n["fat_serving"]),
      saturatedFat: pick(n["saturated-fat_serving"]),
      sugars: pick(n["sugars_serving"]),
      salt: pick(n["salt_serving"]),
      fiber: pick(n["fiber_serving"]),
      proteins: pick(n["proteins_serving"])
    },
    ingredientsText: p.ingredients_text || "",
    allergens: (p.allergens || "").split(",").map(/** @param {string} s */ (s) => s.trim()).filter(Boolean),
    allergenTags: (p.allergens_tags || []).map(/** @param {string} t */ (t) => t.replace(/^en:/, "")),
    ingredientsAnalysisTags: (p.ingredients_analysis_tags || []).map(/** @param {string} t */ (t) => t.replace(/^en:/, "")),
    labelTags: (p.labels_tags || []).map(/** @param {string} t */ (t) => t.replace(/^en:/, "")),
    additives: (p.additives_tags || []).map(/** @param {string} t */ (t) => t.replace(/^en:/, "").toUpperCase()),
    categoriesTags: p.categories_tags || [],
    scannedAt: Date.now()
  };
}

/**
 * @param {...any} vals
 * @returns {number|null}
 */
function pick(...vals) {
  for (const v of vals) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}

/**
 * Best-effort lookup of a few better-scoring products in the same category.
 * Returns [] on any failure — this is a nice-to-have, never blocks the main result.
 * @param {Product} product
 * @returns {Promise<AlternativeProduct[]>}
 */
export async function fetchAlternatives(product) {
  // Prefer the most specific English-language category tag — localized tags
  // (e.g. "en:Pâtes à tartiner" duplicated under other languages) return poor results.
  const englishTags = (product.categoriesTags || []).filter(t => /^en:[a-z0-9-]+$/.test(t));
  const category = englishTags[englishTags.length - 1];
  if (!category) return [];

  // NOTE: category is pre-validated by the regex above to only contain [a-z0-9-] plus one
  // literal colon — do NOT encodeURIComponent it. OFF's edge routing rejects an encoded
  // ":" (%3A) in categories_tags with a CORS-less "Failed to fetch", while the raw colon works.
  // sort_by=nutriscore_score gives deterministic best-graded-first ordering server-side,
  // so a small page_size is enough (cheaper and less likely to hit anonymous rate limits).
  const url = `${OFF_BASE}/api/v2/search?categories_tags=${category}&sort_by=nutriscore_score&fields=code,product_name,brands,image_front_small_url,nutriscore_grade&page_size=10`;

  let data;
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const products = Array.isArray(data.products) ? data.products : [];
  const rank = { a: 0, b: 1, c: 2, d: 3, e: 4 };

  return products
    .filter(/** @param {any} p */ (p) => p.code && p.code !== product.barcode && p.product_name)
    .filter(/** @param {any} p */ (p) => p.nutriscore_grade && (p.nutriscore_grade === "a" || p.nutriscore_grade === "b"))
    .sort(/** @param {any} a @param {any} b */ (a, b) => (rank[/** @type {keyof typeof rank} */ (a.nutriscore_grade)] ?? 9) - (rank[/** @type {keyof typeof rank} */ (b.nutriscore_grade)] ?? 9))
    .slice(0, 3)
    .map(/** @param {any} p */ (p) => ({
      barcode: p.code,
      name: p.product_name,
      brand: p.brands || "",
      image: p.image_front_small_url || "",
      nutriscoreGrade: p.nutriscore_grade
    }));
}
