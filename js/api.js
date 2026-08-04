// Open Food Facts API wrapper
const OFF_FIELDS = [
  "product_name", "brands", "quantity",
  "image_front_small_url", "image_url", "image_small_url",
  "nutriscore_grade", "nutrition_grades",
  "nova_group",
  "nutriments",
  "ingredients_text",
  "allergens", "allergens_tags",
  "additives_tags",
  "categories_tags"
].join(",");

async function fetchProductByBarcode(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;

  let res;
  try {
    res = await fetch(url, { headers: { "Accept": "application/json" } });
  } catch (e) {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    throw new Error(`Lookup failed (server returned ${res.status}).`);
  }

  const data = await res.json();

  if (data.status !== 1 || !data.product) {
    const err = new Error("Product not found in the Open Food Facts database.");
    err.notFound = true;
    throw err;
  }

  return normalizeProduct(data.product, barcode);
}

function normalizeProduct(p, barcode) {
  const n = p.nutriments || {};
  return {
    barcode,
    name: p.product_name || "Unknown product",
    brand: p.brands || "",
    quantity: p.quantity || "",
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
    ingredientsText: p.ingredients_text || "",
    allergens: (p.allergens || "").split(",").map(s => s.trim()).filter(Boolean),
    additives: (p.additives_tags || []).map(t => t.replace(/^en:/, "").toUpperCase()),
    scannedAt: Date.now()
  };
}

function pick(...vals) {
  for (const v of vals) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}
