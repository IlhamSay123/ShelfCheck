// Shopping trip mode: batch-scan a session, track a running healthy/moderate/unhealthy tally

const TRIP_KEY = "shelfcheck_trip_v1";

function defaultTrip() {
  return { active: false, items: [] };
}

function loadTrip() {
  try {
    return { ...defaultTrip(), ...JSON.parse(localStorage.getItem(TRIP_KEY)) };
  } catch (e) {
    return defaultTrip();
  }
}

function saveTrip(trip) {
  localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
}

function setTripActive(active) {
  const trip = loadTrip();
  trip.active = active;
  if (active && trip.items.length === 0) trip.items = [];
  saveTrip(trip);
  return trip;
}

function addToTrip(product, verdict) {
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

function endTrip() {
  saveTrip(defaultTrip());
  return defaultTrip();
}

function tripTally(trip) {
  const tally = { good: 0, moderate: 0, bad: 0 };
  trip.items.forEach(item => {
    if (tally[item.tier] != null) tally[item.tier]++;
  });
  return tally;
}
