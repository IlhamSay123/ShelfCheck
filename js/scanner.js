// Camera barcode scanning wrapper around html5-qrcode

const Scanner = (() => {
  let html5QrCode = null;
  let currentCameraId = null;
  let cameras = [];
  let torchOn = false;
  let running = false;

  const READER_ID = "reader";

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
      verbose: false
    });

    try {
      cameras = await Html5Qrcode.getCameras();
    } catch (e) {
      cameras = [];
    }

    const cameraConfig = cameras.length > 0
      ? { deviceId: { exact: pickRearCamera() } }
      : { facingMode: "environment" };

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
        return { width: size, height: Math.floor(size * 0.55) };
      },
      aspectRatio: 1.5
    };

    try {
      await html5QrCode.start(
        cameraConfig,
        config,
        (decodedText) => {
          onDecoded(decodedText);
        },
        () => { /* per-frame decode failure, ignore */ }
      );
      running = true;
      currentCameraId = cameraConfig.deviceId ? cameraConfig.deviceId.exact : null;
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
      await html5QrCode.applyVideoConstraints({
        advanced: [{ torch: torchOn }]
      });
    } catch (e) {
      torchOn = false;
      return false;
    }
    return torchOn;
  }

  async function switchCamera() {
    if (cameras.length < 2) return false;
    const idx = cameras.findIndex(c => c.id === currentCameraId);
    const next = cameras[(idx + 1) % cameras.length];
    currentCameraId = next.id;
    await stop();
    try {
      await html5QrCode.start(
        { deviceId: { exact: next.id } },
        {
          fps: 10,
          qrbox: (w, h) => {
            const size = Math.floor(Math.min(w, h) * 0.7);
            return { width: size, height: Math.floor(size * 0.55) };
          }
        },
        (decodedText) => window.__onScanDecoded && window.__onScanDecoded(decodedText),
        () => {}
      );
      running = true;
    } catch (e) { /* ignore */ }
    return true;
  }

  function isRunning() { return running; }
  function hasMultipleCameras() { return cameras.length > 1; }

  return { start, stop, toggleTorch, switchCamera, isRunning, hasMultipleCameras };
})();
