// @ts-check
// Health verdict + nutrient traffic-light logic

/** @typedef {import("./api.js").Product} Product */
/** @typedef {import("./api.js").Nutriments} Nutriments */

/** @typedef {"good"|"moderate"|"bad"|"unknown"} Tier */
/** @typedef {"low"|"medium"|"high"|"unknown"} NutrientLevel */

/**
 * @typedef {Object} Verdict
 * @property {Tier} tier
 * @property {string} emoji
 * @property {string} label
 * @property {string} reason
 * @property {"nutriscore"|"fallback"} source
 * @property {boolean} novaDowngraded
 */

/**
 * @typedef {Object} VerdictFactor
 * @property {string} icon
 * @property {string} text
 */

// FSA-style per-100g thresholds (solid food)
export const THRESHOLDS = {
  fat:          { low: 3,   high: 17.5 },
  saturatedFat: { low: 1.5, high: 5 },
  sugars:       { low: 5,   high: 22.5 },
  salt:         { low: 0.3, high: 1.5 }
};

/**
 * @param {keyof typeof THRESHOLDS} key
 * @param {number|null|undefined} value
 * @returns {NutrientLevel}
 */
export function nutrientLevel(key, value) {
  if (value == null) return "unknown";
  const t = THRESHOLDS[key];
  if (!t) return "unknown";
  if (value <= t.low) return "low";
  if (value >= t.high) return "high";
  return "medium";
}

/**
 * Used only when Open Food Facts has no Nutri-Score for the product.
 * @param {Nutriments} nutriments
 * @returns {Tier}
 */
export function computeFallbackScore(nutriments) {
  /** @type {(keyof typeof THRESHOLDS)[]} */
  const keys = ["fat", "saturatedFat", "sugars", "salt"];
  let high = 0, low = 0, known = 0;
  keys.forEach(k => {
    const level = nutrientLevel(k, nutriments[k]);
    if (level === "unknown") return;
    known++;
    if (level === "high") high++;
    if (level === "low") low++;
  });

  if (known === 0) return "unknown";
  if (high >= 2) return "bad";
  if (high === 1 && low === 0) return "moderate";
  if (low >= 3 && high === 0) return "good";
  if (high === 0) return "moderate";
  return "moderate";
}

/**
 * @param {Product} product
 * @returns {Verdict}
 */
export function getVerdict(product) {
  const grade = product.nutriscoreGrade;
  /** @type {Tier} */
  let tier;
  /** @type {"nutriscore"|"fallback"} */
  let source;

  if (grade && "abcde".includes(grade)) {
    if (grade === "a" || grade === "b") tier = "good";
    else if (grade === "c") tier = "moderate";
    else tier = "bad";
    source = "nutriscore";
  } else {
    tier = computeFallbackScore(product.nutriments);
    source = "fallback";
  }

  // Ultra-processed foods (NOVA 4) never read as "good", regardless of Nutri-Score.
  let novaDowngraded = false;
  if (product.novaGroup === 4 && tier === "good") {
    tier = "moderate";
    novaDowngraded = true;
  }

  const copy = {
    good: { emoji: "✅", label: "Healthy choice" },
    moderate: { emoji: "⚠️", label: "Eat in moderation" },
    bad: { emoji: "🚫", label: "Not a healthy choice" },
    unknown: { emoji: "❔", label: "Not enough data" }
  }[tier];

  let reason;
  if (source === "nutriscore") {
    reason = `Based on Nutri-Score ${grade.toUpperCase()}`;
    if (novaDowngraded) reason += " · downgraded: ultra-processed (NOVA 4)";
  } else if (tier === "unknown") {
    reason = "Nutrition data is incomplete for this product.";
  } else {
    reason = "Estimated from sugar, fat, saturated fat & salt levels (no Nutri-Score available).";
  }

  return { tier, ...copy, reason, source, novaDowngraded };
}

const NUTRIENT_LABELS = { fat: "Fat", saturatedFat: "Saturated fat", sugars: "Sugars", salt: "Salt" };

/**
 * Human-readable breakdown of why a product got its verdict, for the "why this score" panel.
 * @param {Product} product
 * @param {Verdict} verdict
 * @returns {VerdictFactor[]}
 */
export function explainVerdict(product, verdict) {
  const factors = [];
  const grade = product.nutriscoreGrade;

  if (verdict.source === "nutriscore") {
    factors.push({
      icon: "📊",
      text: `Nutri-Score ${grade.toUpperCase()} (from Open Food Facts) weighs sugar, saturated fat, salt and energy against fibre, protein and fruit/vegetable content.`
    });
  } else {
    factors.push({
      icon: "🧮",
      text: "This product has no official Nutri-Score, so the verdict is estimated from sugar, fat, saturated fat and salt levels per 100g."
    });
  }

  /** @type {(keyof typeof THRESHOLDS)[]} */
  const factorKeys = ["sugars", "saturatedFat", "fat", "salt"];
  factorKeys.forEach(key => {
    const level = nutrientLevel(key, product.nutriments[key]);
    if (level !== "high" && level !== "low") return;
    const value = product.nutriments[key];
    const label = NUTRIENT_LABELS[key];
    const threshold = level === "high" ? THRESHOLDS[key].high : THRESHOLDS[key].low;
    factors.push({
      icon: level === "high" ? "🔺" : "🔻",
      text: `${label} is ${level} — ${value}g per 100g, ${level === "high" ? "above" : "at or below"} the ${threshold}g ${level} threshold.`
    });
  });

  if (product.novaGroup === 4) {
    factors.push({
      icon: "⚙️",
      text: verdict.novaDowngraded
        ? "Ultra-processed (NOVA group 4) — this downgraded an otherwise good Nutri-Score, since heavy processing isn't captured by Nutri-Score alone."
        : "Ultra-processed (NOVA group 4) — indicates significant industrial processing beyond the nutrient breakdown above."
    });
  }

  return factors;
}

/**
 * @param {number|null|undefined} group
 * @returns {{text: string, detail: string}}
 */
export function novaLabel(group) {
  switch (group) {
    case 1: return { text: "1 · Unprocessed", detail: "Unprocessed or minimally processed food." };
    case 2: return { text: "2 · Processed culinary", detail: "Processed culinary ingredient." };
    case 3: return { text: "3 · Processed", detail: "Processed food." };
    case 4: return { text: "4 · Ultra-processed", detail: "Ultra-processed food/drink product." };
    default: return { text: "—", detail: "No processing data available." };
  }
}

// EU-style Reference Intake for an average adult, per day — the same numbers printed on packaging.
export const REFERENCE_INTAKE = {
  energyKcal: 2000,
  fat: 70,
  saturatedFat: 20,
  sugars: 90,
  salt: 6,
  fiber: 30,
  proteins: 50
};

/**
 * @param {keyof typeof REFERENCE_INTAKE} key
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
export function percentOfRI(key, value) {
  const ref = REFERENCE_INTAKE[key];
  if (!ref || value == null) return null;
  return Math.min(100, Math.round((value / ref) * 100));
}

const GRADE_GAUGE_FILL = { a: 0.95, b: 0.75, c: 0.55, d: 0.35, e: 0.15 };
const TIER_GAUGE_FILL = { good: 0.75, moderate: 0.5, bad: 0.2, unknown: 0.05 };

/**
 * @param {Product} product
 * @param {Verdict} verdict
 * @returns {number}
 */
export function gaugeFillFor(product, verdict) {
  const grade = product.nutriscoreGrade;
  if (grade && GRADE_GAUGE_FILL[/** @type {keyof typeof GRADE_GAUGE_FILL} */ (grade)] != null) {
    return GRADE_GAUGE_FILL[/** @type {keyof typeof GRADE_GAUGE_FILL} */ (grade)];
  }
  return TIER_GAUGE_FILL[verdict.tier] ?? 0.05;
}
