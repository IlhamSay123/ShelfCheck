// @ts-check
// Daily nutrient log: "log this" a scanned product against a per-day diary

/** @typedef {import("./api.js").Product} Product */
/** @typedef {import("./api.js").Nutriments} Nutriments */

/**
 * @typedef {Object} LogEntry
 * @property {string} id
 * @property {string} barcode
 * @property {string} name
 * @property {string} image
 * @property {string} portionLabel
 * @property {Nutriments} nutrients
 * @property {number} loggedAt
 */

/** @typedef {Record<string, LogEntry[]>} DailyLog */

const LOG_KEY = "shelfcheck_log_v1";
/** @type {(keyof Nutriments)[]} */
const NUTRIENT_KEYS = ["energyKcal", "fat", "saturatedFat", "sugars", "salt", "fiber", "proteins"];

/**
 * @param {Date} [date]
 * @returns {string}
 */
export function todayKey(date = new Date()) {
  // Built from local getters, not toISOString() (which is UTC) — shiftDateKey()
  // constructs its Date in local time, and mixing the two silently drifts the
  // diary's day boundary by one for anyone east of UTC.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** @returns {DailyLog} */
function loadLog() {
  try {
    return JSON.parse(/** @type {string} */ (localStorage.getItem(LOG_KEY))) || {};
  } catch {
    return {};
  }
}

/** @param {DailyLog} log */
function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

/**
 * Prefers per-serving nutrition (what you actually ate); falls back to per-100g if OFF has no serving data.
 * @param {Product} product
 * @returns {{label: string, nutrients: Nutriments}}
 */
export function portionForLog(product) {
  const hasServing = NUTRIENT_KEYS.some(k => product.servingNutriments[k] != null);
  if (hasServing) {
    return {
      label: product.servingSize ? `1 serving (${product.servingSize})` : "1 serving",
      nutrients: product.servingNutriments
    };
  }
  return {
    label: "100g",
    nutrients: product.nutriments
  };
}

/**
 * @param {Product} product
 * @param {string} [dateKey]
 * @returns {LogEntry[]}
 */
export function logProduct(product, dateKey = todayKey()) {
  const log = loadLog();
  if (!log[dateKey]) log[dateKey] = [];

  const portion = portionForLog(product);
  log[dateKey].push({
    id: `${product.barcode}-${Date.now()}`,
    barcode: product.barcode,
    name: product.name,
    image: product.image,
    portionLabel: portion.label,
    nutrients: portion.nutrients,
    loggedAt: Date.now()
  });

  saveLog(log);
  return log[dateKey];
}

/**
 * @param {string} dateKey
 * @param {string} entryId
 * @returns {LogEntry[]}
 */
export function removeLogEntry(dateKey, entryId) {
  const log = loadLog();
  if (!log[dateKey]) return [];
  log[dateKey] = log[dateKey].filter(e => e.id !== entryId);
  if (log[dateKey].length === 0) delete log[dateKey];
  saveLog(log);
  return log[dateKey] || [];
}

/**
 * @param {string} dateKey
 * @returns {LogEntry[]}
 */
export function getEntriesForDate(dateKey) {
  const log = loadLog();
  return log[dateKey] || [];
}

/**
 * @param {LogEntry[]} entries
 * @returns {Nutriments}
 */
export function computeTotals(entries) {
  /** @type {any} */
  const totals = {};
  NUTRIENT_KEYS.forEach(k => { totals[k] = 0; });
  entries.forEach(entry => {
    NUTRIENT_KEYS.forEach(k => {
      const v = entry.nutrients[k];
      if (v != null) totals[k] += v;
    });
  });
  return totals;
}

/**
 * @param {string} dateKey
 * @param {number} deltaDays
 * @returns {string}
 */
export function shiftDateKey(dateKey, deltaDays) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return todayKey(d);
}

/**
 * @param {string} dateKey
 * @returns {string}
 */
export function formatDateLabel(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  const today = todayKey();
  const yesterday = shiftDateKey(today, -1);
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
