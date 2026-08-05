// Shared fixture builders for tests — keep production modules free of test-only code.

/** @typedef {import("../js/api.js").Product} Product */
/** @typedef {import("../js/api.js").Nutriments} Nutriments */

/**
 * @param {Partial<Nutriments>} [overrides]
 * @returns {Nutriments}
 */
export function makeNutriments(overrides = {}) {
  return {
    energyKcal: null,
    fat: null,
    saturatedFat: null,
    sugars: null,
    salt: null,
    fiber: null,
    proteins: null,
    ...overrides
  };
}

/**
 * @param {Partial<Product> & {nutriments?: Partial<Nutriments>, servingNutriments?: Partial<Nutriments>}} [overrides]
 * @returns {Product}
 */
export function makeProduct(overrides = {}) {
  const { nutriments, servingNutriments, ...rest } = overrides;
  return {
    barcode: "0000000000000",
    name: "Test Product",
    brand: "Test Brand",
    quantity: "100g",
    servingSize: "",
    image: "",
    nutriscoreGrade: "",
    novaGroup: null,
    nutriments: makeNutriments(nutriments),
    servingNutriments: makeNutriments(servingNutriments),
    ingredientsText: "",
    allergens: [],
    allergenTags: [],
    ingredientsAnalysisTags: [],
    labelTags: [],
    additives: [],
    categoriesTags: [],
    scannedAt: Date.now(),
    ...rest
  };
}
