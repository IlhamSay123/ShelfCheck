// Daily nutrient log: "log this" a scanned product against a per-day diary

const LOG_KEY = "shelfcheck_log_v1";
const NUTRIENT_KEYS = ["energyKcal", "fat", "saturatedFat", "sugars", "salt", "fiber", "proteins"];

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, local-ish enough for a food diary
}

function loadLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

// Prefers per-serving nutrition (what you actually ate); falls back to per-100g if OFF has no serving data.
function portionForLog(product) {
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

function logProduct(product, dateKey = todayKey()) {
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

function removeLogEntry(dateKey, entryId) {
  const log = loadLog();
  if (!log[dateKey]) return [];
  log[dateKey] = log[dateKey].filter(e => e.id !== entryId);
  if (log[dateKey].length === 0) delete log[dateKey];
  saveLog(log);
  return log[dateKey] || [];
}

function getEntriesForDate(dateKey) {
  const log = loadLog();
  return log[dateKey] || [];
}

function computeTotals(entries) {
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

function shiftDateKey(dateKey, deltaDays) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return todayKey(d);
}

function formatDateLabel(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  const today = todayKey();
  const yesterday = shiftDateKey(today, -1);
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
