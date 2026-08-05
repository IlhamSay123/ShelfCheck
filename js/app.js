// Main app controller
import { fetchProductByBarcode, fetchAlternatives } from "./api.js";
import { getVerdict, novaLabel, explainVerdict, percentOfRI, gaugeFillFor, nutrientLevel } from "./health.js";
import { ALLERGEN_OPTIONS, DIET_OPTIONS, LIMIT_OPTIONS, loadProfile, saveProfile, checkConflicts } from "./profile.js";
import { todayKey, logProduct, removeLogEntry, getEntriesForDate, computeTotals, shiftDateKey, formatDateLabel } from "./log.js";
import { loadTrip, setTripActive, addToTrip, endTrip, tripTally } from "./trip.js";
import { Scanner } from "./scanner.js";

(function () {
  const HISTORY_KEY = "shelfcheck_history_v1";
  const MAX_HISTORY = 50;
  const GAUGE_RADIUS = 52;
  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

  const NUTRIENT_ITEMS = [
    { key: "energyKcal", label: "Energy", unit: "kcal", colored: false },
    { key: "fat", label: "Fat", unit: "g", colored: true },
    { key: "saturatedFat", label: "Saturated Fat", unit: "g", colored: true },
    { key: "sugars", label: "Sugars", unit: "g", colored: true },
    { key: "salt", label: "Salt", unit: "g", colored: true },
    { key: "fiber", label: "Fiber", unit: "g", colored: false },
    { key: "proteins", label: "Protein", unit: "g", colored: false }
  ];

  const els = {
    navBtns: document.querySelectorAll(".nav-btn"),
    views: {
      scanner: document.getElementById("view-scanner"),
      log: document.getElementById("view-log"),
      history: document.getElementById("view-history"),
      profile: document.getElementById("view-profile")
    },
    btnStartScan: document.getElementById("btn-start-scan"),
    btnStopScan: document.getElementById("btn-stop-scan"),
    btnTorch: document.getElementById("btn-torch"),
    btnSwitchCam: document.getElementById("btn-switch-cam"),
    zoomControl: document.getElementById("zoom-control"),
    zoomSlider: document.getElementById("zoom-slider"),
    scanHint: document.getElementById("scan-hint"),
    manualForm: document.getElementById("manual-form"),
    manualInput: document.getElementById("manual-input"),
    loading: document.getElementById("loading"),
    errorBox: document.getElementById("error-box"),
    errorText: document.getElementById("error-text"),
    btnRetry: document.getElementById("btn-retry"),
    result: document.getElementById("result"),
    resultImg: document.getElementById("result-img"),
    resultName: document.getElementById("result-name"),
    resultBrand: document.getElementById("result-brand"),
    resultQty: document.getElementById("result-qty"),
    warningBanner: document.getElementById("warning-banner"),
    warningList: document.getElementById("warning-list"),
    verdictRow: document.getElementById("verdict-row"),
    gaugeFillCircle: document.getElementById("gauge-fill-circle"),
    gaugeGradeText: document.getElementById("gauge-grade-text"),
    verdictLabel: document.getElementById("verdict-label"),
    verdictReason: document.getElementById("verdict-reason"),
    novaBadge: document.getElementById("nova-badge"),
    alternativesSection: document.getElementById("alternatives-section"),
    alternativesList: document.getElementById("alternatives-list"),
    nutrientLights: document.getElementById("nutrient-lights"),
    ingredientsSection: document.getElementById("ingredients-section"),
    ingredientsText: document.getElementById("ingredients-text"),
    allergensSection: document.getElementById("allergens-section"),
    allergensText: document.getElementById("allergens-text"),
    additivesSection: document.getElementById("additives-section"),
    additivesText: document.getElementById("additives-text"),
    btnScanAgain: document.getElementById("btn-scan-again"),
    btnLogThis: document.getElementById("btn-log-this"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    btnClearHistory: document.getElementById("btn-clear-history"),
    logDateLabel: document.getElementById("log-date-label"),
    logPrevDay: document.getElementById("log-prev-day"),
    logNextDay: document.getElementById("log-next-day"),
    logTotals: document.getElementById("log-totals"),
    logList: document.getElementById("log-list"),
    logEmpty: document.getElementById("log-empty"),
    profileAllergens: document.getElementById("profile-allergens"),
    profileDiets: document.getElementById("profile-diets"),
    profileLimits: document.getElementById("profile-limits"),
    profileSavedHint: document.getElementById("profile-saved-hint"),
    toast: document.getElementById("toast"),
    tripToggle: document.getElementById("trip-toggle"),
    tripPanel: document.getElementById("trip-panel"),
    tripCountGood: document.getElementById("trip-count-good"),
    tripCountModerate: document.getElementById("trip-count-moderate"),
    tripCountBad: document.getElementById("trip-count-bad"),
    tripList: document.getElementById("trip-list"),
    tripEmpty: document.getElementById("trip-empty"),
    btnEndTrip: document.getElementById("btn-end-trip"),
    whyScoreList: document.getElementById("why-score-list")
  };

  let lastScanTime = 0;
  const SCAN_DEBOUNCE_MS = 1500;
  let currentProduct = null;
  let currentLogDate = todayKey();
  let savedHintTimer = null;

  // ---------- View switching ----------
  els.navBtns.forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  function switchView(view) {
    els.navBtns.forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    Object.entries(els.views).forEach(([key, el]) => {
      el.classList.toggle("active", key === view);
    });
    if (view === "history") renderHistory();
    if (view === "log") renderLogView();
    if (view === "profile") renderProfileView();
    if (view !== "scanner") Scanner.stop();
  }

  // ---------- Scanning ----------
  const SCANNING_HINT = "Fill the frame with the barcode and hold steady — use the zoom slider to get closer without moving.";

  els.btnStartScan.addEventListener("click", async () => {
    resetPanels();
    els.btnStartScan.classList.add("hidden");
    els.btnStopScan.classList.remove("hidden");
    els.scanHint.textContent = "Starting camera…";

    window.__onScanDecoded = handleDecoded;

    await Scanner.start(handleDecoded, (msg) => {
      showToast(msg);
      els.btnStartScan.classList.remove("hidden");
      els.btnStopScan.classList.add("hidden");
      els.scanHint.textContent = "Point your camera at a barcode (EAN/UPC) on any packaged food.";
    });

    if (Scanner.isRunning()) {
      els.scanHint.textContent = SCANNING_HINT;
      if (Scanner.hasMultipleCameras()) els.btnSwitchCam.classList.remove("hidden");
      setupCameraControls();
    }
  });

  els.btnStopScan.addEventListener("click", async () => {
    await Scanner.stop();
    resetCameraControlsUi();
  });

  els.btnTorch.addEventListener("click", async () => {
    const on = await Scanner.toggleTorch();
    els.btnTorch.style.opacity = on ? "1" : "0.6";
  });

  els.btnSwitchCam.addEventListener("click", async () => {
    await Scanner.switchCamera();
    setupCameraControls(); // the new camera may have different torch/zoom capabilities
  });

  els.zoomSlider.addEventListener("input", () => {
    Scanner.setZoom(Number(els.zoomSlider.value));
  });

  function setupCameraControls() {
    els.btnTorch.classList.toggle("hidden", !Scanner.hasTorch());
    els.btnTorch.style.opacity = "0.6";

    const zoomRange = Scanner.getZoomRange();
    if (zoomRange) {
      els.zoomSlider.min = zoomRange.min;
      els.zoomSlider.max = zoomRange.max;
      els.zoomSlider.step = zoomRange.step;
      els.zoomSlider.value = zoomRange.min;
      els.zoomControl.classList.remove("hidden");
    } else {
      els.zoomControl.classList.add("hidden");
    }
  }

  function resetCameraControlsUi() {
    els.btnStartScan.classList.remove("hidden");
    els.btnStopScan.classList.add("hidden");
    els.btnTorch.classList.add("hidden");
    els.btnSwitchCam.classList.add("hidden");
    els.zoomControl.classList.add("hidden");
    els.scanHint.textContent = "Point your camera at a barcode (EAN/UPC) on any packaged food.";
  }

  async function handleDecoded(barcode) {
    const now = Date.now();
    if (now - lastScanTime < SCAN_DEBOUNCE_MS) return;
    lastScanTime = now;

    await Scanner.stop();
    resetCameraControlsUi();

    if (navigator.vibrate) navigator.vibrate(80);
    lookup(barcode);
  }

  // ---------- Trip mode ----------
  els.tripToggle.addEventListener("change", () => {
    const trip = setTripActive(els.tripToggle.checked);
    if (!trip.active) endTrip();
    renderTripUI();
  });

  els.btnEndTrip.addEventListener("click", () => {
    endTrip();
    els.tripToggle.checked = false;
    renderTripUI();
    showToast("Trip ended");
  });

  function renderTripUI() {
    const trip = loadTrip();
    els.tripToggle.checked = trip.active;
    els.tripPanel.classList.toggle("hidden", !trip.active);
    if (!trip.active) return;

    const tally = tripTally(trip);
    els.tripCountGood.textContent = tally.good;
    els.tripCountModerate.textContent = tally.moderate;
    els.tripCountBad.textContent = tally.bad;

    els.tripEmpty.classList.toggle("hidden", trip.items.length > 0);
    els.tripList.innerHTML = "";
    trip.items.forEach(item => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `
        <span class="history-dot ${item.tier}"></span>
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : `<div style="width:44px;height:44px;border-radius:8px;background:var(--glass)"></div>`}
        <div class="h-info">
          <div class="h-name">${escapeHtml(item.name)}</div>
          <div class="h-meta">${new Date(item.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      `;
      els.tripList.appendChild(li);
    });
  }

  renderTripUI();

  // ---------- Manual entry ----------
  els.manualForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = els.manualInput.value.trim();
    if (!code) return;
    lookup(code);
  });

  els.btnRetry.addEventListener("click", () => resetPanels());
  els.btnScanAgain.addEventListener("click", () => {
    resetPanels();
    els.manualInput.value = "";
  });

  // ---------- Lookup flow ----------
  async function lookup(barcode) {
    resetPanels();
    els.loading.classList.remove("hidden");

    try {
      const product = await fetchProductByBarcode(barcode);
      els.loading.classList.add("hidden");
      const verdict = renderResult(product);
      saveToHistory(product);
      if (loadTrip().active) {
        addToTrip(product, verdict);
        renderTripUI();
        showToast(`Added to trip — ${verdict.label.toLowerCase()}`);
      }
    } catch (err) {
      els.loading.classList.add("hidden");
      els.errorBox.classList.remove("hidden");
      els.errorText.textContent = err.notFound
        ? `No product found for barcode ${barcode}. It may not be in the Open Food Facts database yet.`
        : err.message || "Something went wrong. Please try again.";
    }
  }

  function resetPanels() {
    els.loading.classList.add("hidden");
    els.errorBox.classList.add("hidden");
    els.result.classList.add("hidden");
  }

  // ---------- Rendering: result ----------
  function renderResult(product) {
    currentProduct = product;

    els.resultImg.src = product.image || "";
    els.resultImg.style.visibility = product.image ? "visible" : "hidden";
    els.resultName.textContent = product.name;
    els.resultBrand.textContent = product.brand || "Unknown brand";
    els.resultQty.textContent = product.quantity || "";

    const verdict = getVerdict(product);
    renderWarnings(product);
    renderGauge(product, verdict);

    els.verdictLabel.textContent = verdict.label;
    els.verdictReason.textContent = verdict.reason;

    const nova = novaLabel(product.novaGroup);
    els.novaBadge.textContent = nova.text;
    els.novaBadge.title = nova.detail;

    renderNutrientBars(els.nutrientLights, product.nutriments, NUTRIENT_ITEMS);
    renderAlternatives(product, verdict); // fire-and-forget, fills in once loaded
    renderWhyScore(product, verdict);

    if (product.ingredientsText) {
      els.ingredientsText.textContent = product.ingredientsText;
      els.ingredientsSection.classList.remove("hidden");
    } else {
      els.ingredientsSection.classList.add("hidden");
    }

    if (product.allergens && product.allergens.length) {
      els.allergensText.textContent = product.allergens.join(", ");
      els.allergensSection.classList.remove("hidden");
    } else {
      els.allergensSection.classList.add("hidden");
    }

    if (product.additives && product.additives.length) {
      els.additivesText.textContent = product.additives.join(", ");
      els.additivesSection.classList.remove("hidden");
    } else {
      els.additivesSection.classList.add("hidden");
    }

    els.result.classList.remove("hidden");
    els.result.scrollIntoView({ behavior: "smooth", block: "start" });
    return verdict;
  }

  function renderWhyScore(product, verdict) {
    const factors = explainVerdict(product, verdict);
    els.whyScoreList.innerHTML = factors.map(f => `
      <li><span class="factor-icon" aria-hidden="true">${f.icon}</span><span>${escapeHtml(f.text)}</span></li>
    `).join("");
  }

  function renderGauge(product, verdict) {
    els.verdictRow.className = "verdict-row " + verdict.tier;
    const fill = gaugeFillFor(product, verdict);
    els.gaugeFillCircle.style.strokeDasharray = `${GAUGE_CIRCUMFERENCE}`;
    els.gaugeFillCircle.style.strokeDashoffset = `${GAUGE_CIRCUMFERENCE * (1 - fill)}`;
    els.gaugeGradeText.textContent = product.nutriscoreGrade && "abcde".includes(product.nutriscoreGrade)
      ? product.nutriscoreGrade.toUpperCase()
      : verdict.emoji;
  }

  function renderWarnings(product) {
    const profile = loadProfile();
    const warnings = checkConflicts(product, profile);
    if (warnings.length === 0) {
      els.warningBanner.classList.add("hidden");
      return;
    }
    els.warningList.innerHTML = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("");
    els.warningBanner.classList.remove("hidden");
  }

  async function renderAlternatives(product, verdict) {
    els.alternativesSection.classList.add("hidden");
    els.alternativesList.innerHTML = "";
    if (verdict.tier === "good") return;

    const alts = await fetchAlternatives(product);
    if (!alts.length || currentProduct !== product) return; // user moved on before this resolved

    els.alternativesList.innerHTML = "";
    alts.forEach(alt => {
      const card = document.createElement("div");
      card.className = "alt-card";
      card.innerHTML = `
        ${alt.image ? `<img src="${escapeHtml(alt.image)}" alt="">` : `<div style="width:60px;height:60px;border-radius:8px;background:var(--glass);margin:0 auto 6px"></div>`}
        <div class="alt-name">${escapeHtml(alt.name)}</div>
        <span class="alt-grade">${alt.nutriscoreGrade.toUpperCase()}</span>
      `;
      card.addEventListener("click", () => lookup(alt.barcode));
      els.alternativesList.appendChild(card);
    });
    els.alternativesSection.classList.remove("hidden");
  }

  function renderNutrientBars(container, nutrients, items) {
    container.innerHTML = "";
    items.forEach(item => {
      const value = nutrients[item.key];
      const pct = value == null ? 0 : (percentOfRI(item.key, value) ?? 0);
      const level = item.colored ? nutrientLevel(item.key, value) : "neutral";
      const row = document.createElement("div");
      row.className = "nutrient-bar-row";
      const valueText = value == null ? "—" : `${Math.round(value * 10) / 10}${item.unit} · ${pct}% RI`;
      row.innerHTML = `
        <div class="n-top">
          <span class="n-name">${item.label}</span>
          <span class="n-value">${valueText}</span>
        </div>
        <div class="nutrient-bar-track"><div class="nutrient-bar-fill ${level}" style="width:${pct}%"></div></div>
      `;
      container.appendChild(row);
    });
  }

  // Collapsibles
  document.querySelectorAll(".collapsible-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const open = document.getElementById(btn.dataset.target).classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });

  // ---------- Log this ----------
  els.btnLogThis.addEventListener("click", () => {
    if (!currentProduct) return;
    logProduct(currentProduct);
    showToast(`Logged to today's diary`);
  });

  // ---------- Log view ----------
  function renderLogView() {
    els.logDateLabel.textContent = formatDateLabel(currentLogDate);
    const entries = getEntriesForDate(currentLogDate);
    const totals = computeTotals(entries);

    renderNutrientBars(els.logTotals, totals, NUTRIENT_ITEMS);

    els.logList.innerHTML = "";
    els.logEmpty.classList.toggle("hidden", entries.length > 0);

    entries.slice().reverse().forEach(entry => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `
        ${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="">` : `<div style="width:44px;height:44px;border-radius:8px;background:var(--glass)"></div>`}
        <div class="h-info">
          <div class="h-name">${escapeHtml(entry.name)}</div>
          <div class="h-meta">${escapeHtml(entry.portionLabel)} · ${new Date(entry.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <button class="btn btn-ghost small log-remove-btn" data-id="${entry.id}" title="Remove">✕</button>
      `;
      els.logList.appendChild(li);
    });

    els.logList.querySelectorAll(".log-remove-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeLogEntry(currentLogDate, btn.dataset.id);
        renderLogView();
      });
    });
  }

  els.logPrevDay.addEventListener("click", () => {
    currentLogDate = shiftDateKey(currentLogDate, -1);
    renderLogView();
  });
  els.logNextDay.addEventListener("click", () => {
    currentLogDate = shiftDateKey(currentLogDate, 1);
    renderLogView();
  });

  // ---------- Profile view ----------
  function renderProfileView() {
    const profile = loadProfile();

    els.profileAllergens.innerHTML = "";
    ALLERGEN_OPTIONS.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-toggle" + (profile.allergens.includes(opt.tag) ? " selected" : "");
      btn.textContent = opt.label;
      btn.addEventListener("click", () => toggleProfileArray("allergens", opt.tag));
      els.profileAllergens.appendChild(btn);
    });

    els.profileDiets.innerHTML = "";
    DIET_OPTIONS.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-toggle" + (profile.diets.includes(opt.tag) ? " selected" : "");
      btn.textContent = opt.label;
      btn.addEventListener("click", () => toggleProfileArray("diets", opt.tag));
      els.profileDiets.appendChild(btn);
    });

    els.profileLimits.innerHTML = "";
    LIMIT_OPTIONS.forEach(opt => {
      const row = document.createElement("div");
      row.className = "limit-row";
      const label = document.createElement("label");
      label.textContent = opt.label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.1";
      input.placeholder = opt.unit;
      input.value = profile.limits[opt.key] ?? "";
      input.addEventListener("change", () => {
        const p = loadProfile();
        p.limits = p.limits || {};
        p.limits[opt.key] = input.value === "" ? null : Number(input.value);
        saveProfile(p);
        flashSaved();
      });
      row.appendChild(label);
      row.appendChild(input);
      els.profileLimits.appendChild(row);
    });
  }

  function toggleProfileArray(field, tag) {
    const p = loadProfile();
    p[field] = p[field] || [];
    const idx = p[field].indexOf(tag);
    if (idx === -1) p[field].push(tag); else p[field].splice(idx, 1);
    saveProfile(p);
    renderProfileView();
    flashSaved();
  }

  function flashSaved() {
    els.profileSavedHint.classList.remove("hidden");
    clearTimeout(savedHintTimer);
    savedHintTimer = setTimeout(() => els.profileSavedHint.classList.add("hidden"), 1500);
  }

  // ---------- History ----------
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveToHistory(product) {
    let history = loadHistory().filter(p => p.barcode !== product.barcode);
    history.unshift(product);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function renderHistory() {
    const history = loadHistory();
    els.historyList.innerHTML = "";
    els.historyEmpty.classList.toggle("hidden", history.length > 0);

    history.forEach(product => {
      const verdict = getVerdict(product);
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `
        <span class="history-dot ${verdict.tier}"></span>
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : `<div style="width:44px;height:44px;border-radius:8px;background:var(--glass)"></div>`}
        <div class="h-info">
          <div class="h-name">${escapeHtml(product.name)}</div>
          <div class="h-meta">${escapeHtml(product.brand || "")} · ${new Date(product.scannedAt).toLocaleDateString()}</div>
        </div>
      `;
      li.addEventListener("click", () => {
        switchView("scanner");
        renderResult(product);
      });
      els.historyList.appendChild(li);
    });
  }

  els.btnClearHistory.addEventListener("click", () => {
    if (confirm("Clear all scan history?")) {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 3500);
  }

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
