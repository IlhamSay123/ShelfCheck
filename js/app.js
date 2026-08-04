// Main app controller
(function () {
  const HISTORY_KEY = "shelfcheck_history_v1";
  const MAX_HISTORY = 50;

  const els = {
    tabBtns: document.querySelectorAll(".tab-btn"),
    views: {
      scanner: document.getElementById("view-scanner"),
      history: document.getElementById("view-history")
    },
    btnStartScan: document.getElementById("btn-start-scan"),
    btnStopScan: document.getElementById("btn-stop-scan"),
    btnTorch: document.getElementById("btn-torch"),
    btnSwitchCam: document.getElementById("btn-switch-cam"),
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
    verdictBadge: document.getElementById("verdict-badge"),
    verdictEmoji: document.getElementById("verdict-emoji"),
    verdictLabel: document.getElementById("verdict-label"),
    verdictReason: document.getElementById("verdict-reason"),
    nutriscoreBadge: document.getElementById("nutriscore-badge"),
    novaBadge: document.getElementById("nova-badge"),
    nutrientLights: document.getElementById("nutrient-lights"),
    ingredientsSection: document.getElementById("ingredients-section"),
    ingredientsText: document.getElementById("ingredients-text"),
    allergensSection: document.getElementById("allergens-section"),
    allergensText: document.getElementById("allergens-text"),
    additivesSection: document.getElementById("additives-section"),
    additivesText: document.getElementById("additives-text"),
    btnScanAgain: document.getElementById("btn-scan-again"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    btnClearHistory: document.getElementById("btn-clear-history"),
    toast: document.getElementById("toast")
  };

  let lastScanTime = 0;
  const SCAN_DEBOUNCE_MS = 1500;

  // ---------- View switching ----------
  els.tabBtns.forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  function switchView(view) {
    els.tabBtns.forEach(b => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    Object.entries(els.views).forEach(([key, el]) => {
      el.classList.toggle("active", key === view);
    });
    if (view === "history") renderHistory();
    if (view !== "scanner") Scanner.stop();
  }

  // ---------- Scanning ----------
  els.btnStartScan.addEventListener("click", async () => {
    resetPanels();
    els.btnStartScan.classList.add("hidden");
    els.btnStopScan.classList.remove("hidden");
    els.scanHint.textContent = "Align the barcode within the frame…";

    window.__onScanDecoded = handleDecoded;

    await Scanner.start(handleDecoded, (msg) => {
      showToast(msg);
      els.btnStartScan.classList.remove("hidden");
      els.btnStopScan.classList.add("hidden");
      els.scanHint.textContent = "Point your camera at a barcode (EAN/UPC) on any packaged food.";
    });

    if (Scanner.isRunning()) {
      els.btnTorch.classList.remove("hidden");
      if (Scanner.hasMultipleCameras()) els.btnSwitchCam.classList.remove("hidden");
    }
  });

  els.btnStopScan.addEventListener("click", async () => {
    await Scanner.stop();
    els.btnStartScan.classList.remove("hidden");
    els.btnStopScan.classList.add("hidden");
    els.btnTorch.classList.add("hidden");
    els.btnSwitchCam.classList.add("hidden");
    els.scanHint.textContent = "Point your camera at a barcode (EAN/UPC) on any packaged food.";
  });

  els.btnTorch.addEventListener("click", async () => {
    const on = await Scanner.toggleTorch();
    els.btnTorch.style.opacity = on ? "1" : "0.6";
  });

  els.btnSwitchCam.addEventListener("click", () => Scanner.switchCamera());

  async function handleDecoded(barcode) {
    const now = Date.now();
    if (now - lastScanTime < SCAN_DEBOUNCE_MS) return;
    lastScanTime = now;

    await Scanner.stop();
    els.btnStartScan.classList.remove("hidden");
    els.btnStopScan.classList.add("hidden");
    els.btnTorch.classList.add("hidden");
    els.btnSwitchCam.classList.add("hidden");

    if (navigator.vibrate) navigator.vibrate(80);
    lookup(barcode);
  }

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
      renderResult(product);
      saveToHistory(product);
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

  // ---------- Rendering ----------
  function renderResult(product) {
    els.resultImg.src = product.image || "";
    els.resultImg.style.visibility = product.image ? "visible" : "hidden";
    els.resultName.textContent = product.name;
    els.resultBrand.textContent = product.brand || "Unknown brand";
    els.resultQty.textContent = product.quantity || "";

    const verdict = getVerdict(product);
    els.verdictBadge.className = "verdict-badge " + verdict.tier;
    els.verdictEmoji.textContent = verdict.emoji;
    els.verdictLabel.textContent = verdict.label;
    els.verdictReason.textContent = verdict.reason;

    els.nutriscoreBadge.textContent = product.nutriscoreGrade && "abcde".includes(product.nutriscoreGrade)
      ? product.nutriscoreGrade.toUpperCase()
      : "?";

    const nova = novaLabel(product.novaGroup);
    els.novaBadge.textContent = product.novaGroup ? String(product.novaGroup) : "?";
    els.novaBadge.title = nova.detail;

    renderNutrientLights(product.nutriments);

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
  }

  function renderNutrientLights(n) {
    const items = [
      { key: "energyKcal", label: "Energy", unit: "kcal", raw: true },
      { key: "fat", label: "Fat", unit: "g" },
      { key: "saturatedFat", label: "Saturated Fat", unit: "g" },
      { key: "sugars", label: "Sugars", unit: "g" },
      { key: "salt", label: "Salt", unit: "g" },
      { key: "proteins", label: "Protein", unit: "g", raw: true }
    ];

    els.nutrientLights.innerHTML = "";
    items.forEach(item => {
      const value = n[item.key];
      const level = item.raw ? "unknown" : nutrientLevel(item.key, value);
      const div = document.createElement("div");
      div.className = "nutrient-chip " + (item.raw ? "" : level);
      div.innerHTML = `
        <span class="n-name">${item.label}</span>
        <span class="n-value">${value == null ? "—" : (Math.round(value * 10) / 10) + item.unit}</span>
      `;
      els.nutrientLights.appendChild(div);
    });
  }

  // Collapsibles
  document.querySelectorAll(".collapsible-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target).classList.toggle("open");
    });
  });

  // ---------- History ----------
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
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
        ${product.image ? `<img src="${product.image}" alt="">` : `<div style="width:44px;height:44px;border-radius:8px;background:var(--bg-elevated)"></div>`}
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
