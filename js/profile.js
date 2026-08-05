// @ts-check
// Personal diet/allergen profile: storage + conflict checking against a product

/** @typedef {import("./api.js").Product} Product */
/** @typedef {import("./api.js").Nutriments} Nutriments */

/**
 * @typedef {Object} Profile
 * @property {string[]} allergens
 * @property {string[]} diets
 * @property {Partial<Record<keyof Nutriments, number|string|null>>} limits
 */

const PROFILE_KEY = "shelfcheck_profile_v1";

export const ALLERGEN_OPTIONS = [
  { tag: "gluten", label: "Gluten" },
  { tag: "milk", label: "Dairy / Milk" },
  { tag: "eggs", label: "Eggs" },
  { tag: "nuts", label: "Tree nuts" },
  { tag: "peanuts", label: "Peanuts" },
  { tag: "soybeans", label: "Soy" },
  { tag: "sesame-seeds", label: "Sesame" },
  { tag: "fish", label: "Fish" },
  { tag: "crustaceans", label: "Crustaceans" },
  { tag: "molluscs", label: "Molluscs" },
  { tag: "celery", label: "Celery" },
  { tag: "mustard", label: "Mustard" },
  { tag: "sulphur-dioxide-and-sulphites", label: "Sulphites" },
  { tag: "lupin", label: "Lupin" }
];

export const DIET_OPTIONS = [
  { tag: "vegan", label: "Vegan" },
  { tag: "vegetarian", label: "Vegetarian" },
  { tag: "halal", label: "Halal" },
  { tag: "kosher", label: "Kosher" }
];

/** @type {{key: keyof Nutriments, label: string, unit: string}[]} */
export const LIMIT_OPTIONS = [
  { key: "sugars", label: "Max sugar per 100g", unit: "g" },
  { key: "salt", label: "Max salt per 100g", unit: "g" },
  { key: "saturatedFat", label: "Max saturated fat per 100g", unit: "g" }
];

/** @returns {Profile} */
function defaultProfile() {
  return { allergens: [], diets: [], limits: {} };
}

/** @returns {Profile} */
export function loadProfile() {
  try {
    const saved = JSON.parse(/** @type {string} */ (localStorage.getItem(PROFILE_KEY)));
    return { ...defaultProfile(), ...saved };
  } catch {
    return defaultProfile();
  }
}

/** @param {Profile} profile */
export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Returns a list of human-readable warning strings, or [] if no conflicts / no profile set.
 * @param {Product} product
 * @param {Profile} profile
 * @returns {string[]}
 */
export function checkConflicts(product, profile) {
  /** @type {string[]} */
  const warnings = [];

  const matchedAllergens = (profile.allergens || []).filter(tag =>
    (product.allergenTags || []).includes(tag)
  );
  if (matchedAllergens.length) {
    const labels = matchedAllergens.map(tag => (ALLERGEN_OPTIONS.find(a => a.tag === tag) || {}).label || tag);
    warnings.push(`Contains ${labels.join(", ")} — on your allergen list`);
  }

  (profile.diets || []).forEach(diet => {
    if (diet === "vegan") {
      if (product.ingredientsAnalysisTags.includes("non-vegan")) {
        warnings.push("Not vegan");
      } else if (product.ingredientsAnalysisTags.includes("maybe-vegan")) {
        warnings.push("May not be vegan — ingredients unclear");
      }
    } else if (diet === "vegetarian") {
      if (product.ingredientsAnalysisTags.includes("non-vegetarian")) {
        warnings.push("Not vegetarian");
      } else if (product.ingredientsAnalysisTags.includes("maybe-vegetarian")) {
        warnings.push("May not be vegetarian — ingredients unclear");
      }
    } else if (diet === "halal") {
      if (!product.labelTags.includes("halal")) {
        warnings.push("Not labeled halal");
      }
    } else if (diet === "kosher") {
      if (!product.labelTags.includes("kosher")) {
        warnings.push("Not labeled kosher");
      }
    }
  });

  LIMIT_OPTIONS.forEach(({ key, label, unit }) => {
    const limit = profile.limits && profile.limits[key];
    const value = product.nutriments[key];
    if (limit != null && limit !== "" && value != null && value > Number(limit)) {
      warnings.push(`${label.replace("Max ", "").replace(" per 100g", "")}: ${value}${unit} exceeds your limit of ${limit}${unit}/100g`);
    }
  });

  return warnings;
}

/**
 * @param {Profile} profile
 * @returns {boolean}
 */
export function hasProfileSet(profile) {
  return (profile.allergens || []).length > 0
    || (profile.diets || []).length > 0
    || Object.values(profile.limits || {}).some(v => v != null && v !== "");
}
