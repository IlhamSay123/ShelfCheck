// @ts-check
// Shopping trip mode: batch-scan a session, track a running healthy/moderate/unhealthy tally

/** @typedef {import("./api.js").Product} Product */
/** @typedef {import("./health.js").Verdict} Verdict */
/** @typedef {import("./health.js").Tier} Tier */

/**
 * @typedef {Object} TripItem
 * @property {string} barcode
 * @property {string} name
 * @property {string} image
 * @property {Tier} tier
 * @property {number} scannedAt
 */

/**
 * @typedef {Object} Trip
 * @property {boolean} active
 * @property {TripItem[]} items
 */

const TRIP_KEY = "shelfcheck_trip_v1";

/** @returns {Trip} */
function defaultTrip() {
  return { active: false, items: [] };
}

/** @returns {Trip} */
export function loadTrip() {
  try {
    return { ...defaultTrip(), ...JSON.parse(/** @type {string} */ (localStorage.getItem(TRIP_KEY))) };
  } catch {
    return defaultTrip();
  }
}

/** @param {Trip} trip */
function saveTrip(trip) {
  localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
}

/**
 * @param {boolean} active
 * @returns {Trip}
 */
export function setTripActive(active) {
  const trip = loadTrip();
  trip.active = active;
  if (active && trip.items.length === 0) trip.items = [];
  saveTrip(trip);
  return trip;
}

/**
 * @param {Product} product
 * @param {Verdict} verdict
 * @returns {Trip}
 */
export function addToTrip(product, verdict) {
  const trip = loadTrip();
  if (!trip.active) return trip;
  trip.items.unshift({
    barcode: product.barcode,
    name: product.name,
    image: product.image,
    tier: verdict.tier,
    scannedAt: Date.now()
  });
  saveTrip(trip);
  return trip;
}

/** @returns {Trip} */
export function endTrip() {
  saveTrip(defaultTrip());
  return defaultTrip();
}

/**
 * @param {Trip} trip
 * @returns {{good: number, moderate: number, bad: number}}
 */
export function tripTally(trip) {
  const tally = { good: 0, moderate: 0, bad: 0 };
  trip.items.forEach(item => {
    if (item.tier === "good" || item.tier === "moderate" || item.tier === "bad") {
      tally[item.tier]++;
    }
  });
  return tally;
}
