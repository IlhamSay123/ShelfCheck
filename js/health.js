// Health verdict + nutrient traffic-light logic

// FSA-style per-100g thresholds (solid food)
const THRESHOLDS = {
  fat:          { low: 3,   high: 17.5 },
  saturatedFat: { low: 1.5, high: 5 },
  sugars:       { low: 5,   high: 22.5 },
  salt:         { low: 0.3, high: 1.5 }
};

function nutrientLevel(key, value) {
  if (value == null) return "unknown";
  const t = THRESHOLDS[key];
  if (!t) return "unknown";
  if (value <= t.low) return "low";
  if (value >= t.high) return "high";
  return "medium";
}

function computeFallbackScore(nutriments) {
  // Used only when Open Food Facts has no Nutri-Score for the product.
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

function getVerdict(product) {
  const grade = product.nutriscoreGrade;
  let tier;
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

  return { tier, ...copy, reason };
}

function novaLabel(group) {
  switch (group) {
    case 1: return { text: "1 · Unprocessed", detail: "Unprocessed or minimally processed food." };
    case 2: return { text: "2 · Processed culinary", detail: "Processed culinary ingredient." };
    case 3: return { text: "3 · Processed", detail: "Processed food." };
    case 4: return { text: "4 · Ultra-processed", detail: "Ultra-processed food/drink product." };
    default: return { text: "—", detail: "No processing data available." };
  }
}
