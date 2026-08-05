// Camera barcode scanning wrapper around html5-qrcode

const Scanner = (() => {
  let html5QrCode = null;
  let currentCameraId = null;
  let cameras = [];
  let torchOn = false;
  let running = false;

  const READER_ID = "reader";

  function buildScanConfig(cameraSelector) {
    // IMPORTANT: supplying `videoConstraints` replaces (does not merge with) the
    // deviceId/facingMode html5-qrcode would otherwise derive from cameraIdOrConfig,
    // so the camera selector has to be folded in here directly — otherwise the
    // browser falls back to picking whatever camera it wants (verified against
    // html5-qrcode 2.3.8 source: start() only calls createVideoConstraints(cameraIdOrConfig)
    // when config.videoConstraints is absent).
    return {
      // Scan as fast as the device can keep up with; html5-qrcode self-throttles
      // if it can't sustain this, so a higher ceiling only ever helps.
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        // Real EAN/UPC barcodes are wide and short — a box shaped to match makes
        // framing faster than a near-square default, and scanning a smaller region
        // is also cheaper per frame.
        const width = Math.floor(Math.min(viewfinderWidth, viewfinderHeight * 1.8) * 0.85);
        const height = Math.max(70, Math.floor(width * 0.38));
        return { width, height };
      },
      aspectRatio: 1.5,
      disableFlip: true, // barcodes are never mirrored; skipping the flip check halves decode attempts
      videoConstraints: {
        ...cameraSelector,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
  }

  async function start(onDecoded, onError) {
    if (running) return;

    if (typeof Html5Qrcode === "undefined") {
      onError("Scanner library failed to load. Check your internet connection.");
      return;
    }

    html5QrCode = new Html5Qrcode(READER_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128
      ],
      // Native BarcodeDetector fast-path where the browser has it (Chrome/Android).
      // iOS Safari doesn't support it, so it transparently falls back to the bundled
      // JS decoder there — this is actually the library's default, set explicitly
      // here so it doesn't silently change on a future upgrade.
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });

    try {
      cameras = await Html5Qrcode.getCameras();
    } catch (e) {
      cameras = [];
    }

    const cameraSelector = cameras.length > 0
      ? { deviceId: { exact: pickRearCamera() } }
      : { facingMode: "environment" };

    try {
      await html5QrCode.start(
        cameraSelector,
        buildScanConfig(cameraSelector),
        (decodedText) => onDecoded(decodedText),
        () => { /* per-frame decode failure, ignore */ }
      );
      running = true;
      currentCameraId = cameraSelector.deviceId ? cameraSelector.deviceId.exact : null;
    } catch (e) {
      onError(cameraFriendlyError(e));
    }
  }

  function pickRearCamera() {
    const back = cameras.find(c => /back|rear|environment/i.test(c.label));
    currentCameraId = (back || cameras[0]).id;
    return currentCameraId;
  }

  function cameraFriendlyError(e) {
    const msg = String(e && e.message ? e.message : e);
    if (/NotAllowedError|Permission/i.test(msg)) {
      return "Camera access was denied. Allow camera access in Safari settings and try again.";
    }
    if (/NotFoundError/i.test(msg)) {
      return "No camera found on this device.";
    }
    return "Could not start the camera. You can still enter a barcode manually below.";
  }

  async function stop() {
    if (!html5QrCode || !running) return;
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (e) { /* ignore */ }
    running = false;
    torchOn = false;
  }

  async function toggleTorch() {
    if (!html5QrCode || !running) return false;
    torchOn = !torchOn;
    try {
      await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
    } catch (e) {
      torchOn = false;
      return false;
    }
    return torchOn;
  }

  function hasTorch() {
    if (!html5QrCode || !running) return false;
    try {
      return html5QrCode.getRunningTrackCameraCapabilities().torchFeature().isSupported();
    } catch (e) {
      return false;
    }
  }

  // Returns {min, max, step} or null when the running camera doesn't support zoom.
  function getZoomRange() {
    if (!html5QrCode || !running) return null;
    try {
      const zoom = html5QrCode.getRunningTrackCameraCapabilities().zoomFeature();
      if (!zoom.isSupported()) return null;
      return { min: zoom.min(), max: zoom.max(), step: zoom.step() || 0.1 };
    } catch (e) {
      return null;
    }
  }

  async function setZoom(value) {
    if (!html5QrCode || !running) return;
    try {
      await html5QrCode.applyVideoConstraints({ advanced: [{ zoom: value }] });
    } catch (e) { /* ignore — slider just won't do anything on this device */ }
  }

  async function switchCamera() {
    if (cameras.length < 2) return false;
    const idx = cameras.findIndex(c => c.id === currentCameraId);
    const next = cameras[(idx + 1) % cameras.length];
    currentCameraId = next.id;
    await stop();
    const cameraSelector = { deviceId: { exact: next.id } };
    try {
      await html5QrCode.start(
        cameraSelector,
        buildScanConfig(cameraSelector),
        (decodedText) => window.__onScanDecoded && window.__onScanDecoded(decodedText),
        () => {}
      );
      running = true;
    } catch (e) { /* ignore */ }
    return true;
  }

  function isRunning() { return running; }
  function hasMultipleCameras() { return cameras.length > 1; }

  return { start, stop, toggleTorch, hasTorch, getZoomRange, setZoom, switchCamera, isRunning, hasMultipleCameras };
})();
