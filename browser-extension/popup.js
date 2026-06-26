/**
 * IIVO Lens — popup UI (hardened v1)
 */

const DIRECT_API = "https://iivo.ai";
const LOCAL_API = "http://localhost:3001";
const LOCAL_WEB = "http://localhost:5173";

/** Resolved at runtime — production API with optional stored auth. */
let apiBase = DIRECT_API;
let webBase = DIRECT_API;
/** @type {Record<string, string>} */
let apiAuthHeaders = {};
const LENS_CAPTURED_VIA = "browser_lens";
const MAX_SUMMARY = 280;
const PREVIEW_CHARS = 420;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);

let capture = null;
let iivoOnline = false;
let recentDuplicate = null;
let pendingScreenshot = null;
/** @type {string | null} */
let screenshotPreviewObjectUrl = null;

function setConnectionPill(state, label) {
  const pill = $("lens-connection-pill");
  if (!pill) return;
  pill.className = `status-pill lens-pill lens-pill-${state}`;
  const dot = pill.querySelector(".lens-pill-dot");
  if (dot) {
    dot.className = "lens-pill-dot dot";
    if (state === "online") dot.classList.add("dot-green");
    else if (state === "checking") dot.classList.add("dot-amber");
  }
  const labelEl = pill.querySelector(".lens-pill-label");
  if (labelEl) labelEl.textContent = label;
}

function setLoading(loading) {
  document.querySelector(".lens-popup")?.classList.toggle("is-loading", loading);
}

function setStatus(message, kind = "muted") {
  const el = $("lens-status");
  const textEl = $("lens-status-text");
  const dismissEl = $("lens-status-dismiss");
  if (!message) {
    el.hidden = true;
    if (textEl) textEl.textContent = "";
    el.className = "lens-status muted";
    return;
  }
  el.hidden = false;
  if (textEl) textEl.textContent = message;
  else el.textContent = message;
  el.className = `lens-status ${kind}`;
  if (dismissEl) dismissEl.hidden = kind === "loading";
}

function setErrorDetail(detail) {
  const box = $("lens-error-details");
  if (!detail) {
    box.hidden = true;
    $("lens-error-detail-text").textContent = "";
    return;
  }
  box.hidden = false;
  $("lens-error-detail-text").textContent = detail;
}

function setBusy(busy) {
  document.querySelectorAll("#lens-actions .lens-btn, .lens-offline-btn-row .lens-btn").forEach((btn) => {
    btn.disabled = busy;
  });
  if (!busy && capture) {
    $("btn-send-selection").disabled = !capture.selectedText?.trim();
  }
}

function setScreenshotMode(active) {
  document.querySelector(".lens-popup")?.classList.toggle("has-screenshot", active);
  $("lens-screenshot-confirm").hidden = !active;
  const emptyScreenshot = $("lens-screenshot-empty");
  if (emptyScreenshot) emptyScreenshot.hidden = active;
  $("btn-ask-page").hidden = active;
  $("btn-ask-screenshot").hidden = !active;
  document.querySelectorAll(".lens-tile-screenshot-only").forEach((el) => {
    el.hidden = !active;
  });

  const pillLabel = $("lens-screenshot-pill-label");
  if (pillLabel) pillLabel.textContent = active ? "Vision Ready" : "Ready";

  const sendLabel = $("btn-send-screenshot")?.querySelector(".lens-btn-label");
  if (sendLabel) {
    sendLabel.textContent = active ? "Send Another Screenshot" : "Send Screenshot";
  }

  document.querySelector(".dual-action-row")?.classList.toggle("is-single-col", !active);
}

function showScreenshotConfirm(show) {
  setScreenshotMode(show);
}

function showOfflineActions(show) {
  $("lens-offline-actions").hidden = !show;
}

function showPreview(show) {
  $("lens-preview").hidden = !show;
  $("lens-actions").hidden = !show;
}

function urlDomain(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

function apiUrl(path) {
  return `${apiBase}${path}`;
}

async function apiFetch(path, options = {}) {
  const headers = { ...apiAuthHeaders, ...(options.headers || {}) };
  return fetch(apiUrl(path), { ...options, headers });
}

async function loadStoredApiSecret() {
  const { iivoApiSecret } = await chrome.storage.local.get("iivoApiSecret");
  return typeof iivoApiSecret === "string" && iivoApiSecret.trim() ? iivoApiSecret.trim() : null;
}

async function probeHealth(base, headers = {}) {
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(4000),
      headers,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data.ok === true;
  } catch {
    return false;
  }
}

async function discoverEndpoints() {
  const secret = await loadStoredApiSecret();
  const headers = secret ? { Authorization: `Bearer ${secret}` } : {};
  if (await probeHealth(DIRECT_API, headers)) {
    apiBase = DIRECT_API;
    webBase = DIRECT_API;
    apiAuthHeaders = headers;
    return true;
  }
  if (await probeHealth(LOCAL_API, headers)) {
    apiBase = LOCAL_API;
    webBase = LOCAL_WEB;
    apiAuthHeaders = headers;
    return true;
  }
  return false;
}

function previewSnippet(text, max = PREVIEW_CHARS) {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "(No readable text detected)";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

async function checkIivoHealth() {
  try {
    const ok = await discoverEndpoints();
    if (!ok) throw new Error("offline");
    iivoOnline = true;
    setConnectionPill("online", "Live");
    return true;
  } catch {
    iivoOnline = false;
    setConnectionPill("offline", "Offline");
    return false;
  }
}

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  if (!tab.url?.startsWith("http")) {
    throw new Error("IIVO Lens works on regular web pages (http/https) only.");
  }

  const requestCapture = () => chrome.tabs.sendMessage(tab.id, { type: "IIVO_LENS_CAPTURE" });

  try {
    const response = await requestCapture();
    if (!response?.ok) throw new Error(response?.error || "Could not capture this page.");
    return response.data;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["contentScript.js"],
    });
    const response = await requestCapture();
    if (!response?.ok) throw new Error(response?.error || "Could not capture this page.");
    return response.data;
  }
}

async function fetchContextItems() {
  const res = await apiFetch("/api/context", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Could not load context library.");
  const body = await res.json();
  return body.items ?? [];
}

function findRecentDuplicate(items, sourceUrl) {
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  const normalized = sourceUrl.trim();
  return items.find((item) => {
    if (item.capturedVia !== LENS_CAPTURED_VIA) return false;
    if (item.sourceUrl?.trim() !== normalized) return false;
    const ts = Date.parse(item.capturedAt ?? item.createdAt);
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

function buildPageContent(data) {
  const parts = [];
  if (data.metaDescription) parts.push(`Description: ${data.metaDescription}`);
  if (data.selectedText) parts.push(`Selected text:\n${data.selectedText}`);
  if (data.pageText) parts.push(`Page text:\n${data.pageText}`);
  return parts.join("\n\n").trim() || data.title;
}

function truncationFields(data, contentText) {
  if (data.truncated) {
    return {
      originalTextLength: data.originalTextLength,
      sentTextLength: data.sentTextLength ?? contentText.length,
      truncated: true,
    };
  }
  return {
    originalTextLength: contentText.length,
    sentTextLength: contentText.length,
    truncated: false,
  };
}

function buildContextPayload(data, mode) {
  const capturedAt = data.capturedAt || new Date().toISOString();
  const baseTags = ["lens", "browser"];

  if (mode === "selection") {
    const contentText = data.selectedText;
    return {
      type: "pasted_text",
      title: data.title ? `Selection: ${data.title}` : "Selected text",
      sourceUrl: data.sourceUrl,
      contentText,
      contentSummary: contentText.slice(0, MAX_SUMMARY),
      tags: [...baseTags, "selected-text"],
      capturedVia: LENS_CAPTURED_VIA,
      capturedAt,
      sourceConfidence: "user_pasted",
      lensCaptureType: "selection",
      ...truncationFields(data, contentText),
    };
  }

  const contentText = buildPageContent(data);
  const isEvidence = mode === "evidence";
  const lensCaptureType = isEvidence ? "evidence" : "page";

  return {
    type: isEvidence ? "evidence" : "url",
    title: data.title || "Web page",
    sourceUrl: data.sourceUrl,
    contentText,
    contentSummary: contentText.slice(0, MAX_SUMMARY),
    tags: [...baseTags, data.selectedText ? "selected-text" : "page-context"],
    capturedVia: LENS_CAPTURED_VIA,
    capturedAt,
    importedAt: capturedAt,
    sourceConfidence: "imported_url",
    lensCaptureType,
    ...truncationFields(data, contentText),
  };
}

async function postContextItem(payload) {
  const res = await apiFetch("/api/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      body.error || "IIVO could not receive this context. Try again or paste the text manually.",
    );
    err.detail = JSON.stringify(body, null, 2);
    throw err;
  }
  return body;
}

async function uploadContextScreenshot(id, imageDataUrl) {
  const res = await apiFetch(`/api/context/${encodeURIComponent(id)}/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "IIVO could not save the screenshot.");
    err.detail = JSON.stringify(body, null, 2);
    throw err;
  }
  return body;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

async function captureVisibleTabScreenshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) throw new Error("No active tab.");
  if (!tab.url?.startsWith("http")) {
    throw new Error("IIVO Lens works on regular web pages (http/https) only.");
  }

  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  if (!imageDataUrl?.startsWith("data:image/")) {
    throw new Error("Could not capture a screenshot of this tab.");
  }

  let pageMeta = capture;
  if (!pageMeta || pageMeta.sourceUrl !== tab.url) {
    try {
      pageMeta = await captureActiveTab();
    } catch {
      pageMeta = {
        title: tab.title?.trim() || "Web page",
        sourceUrl: tab.url,
        capturedAt: new Date().toISOString(),
      };
    }
  }

  return {
    imageDataUrl,
    imageMimeType: "image/png",
    imageSizeBytes: estimateDataUrlBytes(imageDataUrl),
    title: pageMeta.title || tab.title || "Web page",
    sourceUrl: pageMeta.sourceUrl || tab.url,
    capturedAt: pageMeta.capturedAt || new Date().toISOString(),
    metaDescription: pageMeta.metaDescription,
  };
}

function buildScreenshotPayload(data) {
  const capturedAt = data.capturedAt || new Date().toISOString();
  const pageTitle = data.title || "Web page";
  const contentText = [
    `Screenshot captured from page: ${pageTitle}`,
    data.sourceUrl ? `URL: ${data.sourceUrl}` : "",
    data.metaDescription ? `Description: ${data.metaDescription}` : "",
    "",
    "Screenshot image stored locally. Visual pixel analysis may be limited in this build.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    type: "screenshot",
    title: `Screenshot: ${pageTitle}`,
    sourceUrl: data.sourceUrl,
    contentText,
    contentSummary: `Visible tab screenshot from ${urlDomain(data.sourceUrl || "")}`,
    tags: ["lens", "browser", "screenshot"],
    capturedVia: LENS_CAPTURED_VIA,
    capturedAt,
    sourceConfidence: "screenshot",
    lensCaptureType: "screenshot",
    captureType: "visible_tab_screenshot",
    pageTitle,
  };
}

function renderScreenshotPreview(data) {
  const thumb = $("lens-screenshot-thumb");
  if (thumb) {
    thumb.src = data.imageDataUrl;
    thumb.removeAttribute("hidden");
  }
  $("lens-screenshot-format").textContent = "PNG";
  $("lens-screenshot-meta").textContent = formatBytes(data.imageSizeBytes);
  $("lens-screenshot-time").textContent = "Just now";
  $("lens-screenshot-page").textContent = `${data.title} · ${urlDomain(data.sourceUrl || "")}`;
  showScreenshotConfirm(true);
  setStatus(null);
}

function buildScreenshotFilename(data) {
  const domain = urlDomain(data.sourceUrl || "page")
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "page";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `iivo-lens-${domain}-${stamp}.png`;
}

async function downloadScreenshotDataUrl(imageDataUrl, meta = pendingScreenshot) {
  if (!imageDataUrl?.startsWith("data:image/")) {
    throw new Error("No screenshot available to download.");
  }

  const filename = buildScreenshotFilename(meta ?? { sourceUrl: "page" });

  const viaBackground = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "IIVO_LENS_DOWNLOAD_SCREENSHOT",
        imageDataUrl,
        filename,
      },
      (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }
        resolve(response ?? { ok: false, error: "Download failed." });
      },
    );
  });

  if (viaBackground?.ok) {
    return filename;
  }

  const blob = await (await fetch(imageDataUrl)).blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return filename;
}

async function downloadPendingScreenshot() {
  const dataUrl = pendingScreenshot?.imageDataUrl ?? getScreenshotPreviewSrc();
  if (!dataUrl?.startsWith("data:image/")) {
    setStatus("Capture a screenshot first.", "error");
    return;
  }

  setBusy(true);
  setErrorDetail(null);
  setStatus("Opening save dialog…", "muted");

  try {
    const filename = await downloadScreenshotDataUrl(dataUrl, pendingScreenshot);
    setStatus(`Download started: ${filename}`, "success");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Could not download screenshot.", "error");
    if (err instanceof Error) setErrorDetail(err.message);
  } finally {
    setBusy(false);
  }
}

async function startScreenshotCapture() {
  setBusy(true);
  setErrorDetail(null);
  showScreenshotConfirm(false);
  pendingScreenshot = null;
  setStatus("Capturing visible tab screenshot…", "muted");

  try {
    pendingScreenshot = await captureVisibleTabScreenshot();
    renderScreenshotPreview(pendingScreenshot);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Screenshot capture failed.", "error");
    if (err instanceof Error) setErrorDetail(err.message);
  } finally {
    setBusy(false);
  }
}

async function confirmScreenshot(mode) {
  if (!pendingScreenshot) return;
  if (!(await ensureReady())) return;

  setBusy(true);
  setErrorDetail(null);
  setStatus("Sending screenshot to IIVO…", "muted");

  try {
    const payload = buildScreenshotPayload(pendingScreenshot);
    const item = await postContextItem(payload);
    await uploadContextScreenshot(item.id, pendingScreenshot.imageDataUrl);

    if (mode === "ask") {
      setStatus("Screenshot sent to IIVO. Opening chat…", "success");
      openIivo(`/?lensAsk=${encodeURIComponent(item.id)}`);
    } else {
      setStatus("Screenshot saved to Context Library.", "success");
      showScreenshotConfirm(false);
      pendingScreenshot = null;
    }
  } catch (err) {
    setStatus(
      err instanceof Error
        ? err.message
        : "IIVO could not receive this screenshot. Try again.",
      "error",
    );
    if (err instanceof Error && err.detail) setErrorDetail(err.detail);
    else if (err instanceof Error) setErrorDetail(err.message);
  } finally {
    setBusy(false);
  }
}

function cancelScreenshot() {
  closeScreenshotLightbox();
  pendingScreenshot = null;
  showScreenshotConfirm(false);
  $("lens-screenshot-thumb").removeAttribute("src");
  setStatus(null);
}

function revokeScreenshotPreviewObjectUrl() {
  if (screenshotPreviewObjectUrl) {
    URL.revokeObjectURL(screenshotPreviewObjectUrl);
    screenshotPreviewObjectUrl = null;
  }
}

function getScreenshotPreviewSrc() {
  const thumbSrc = $("lens-screenshot-thumb")?.src;
  if (thumbSrc) return thumbSrc;
  return pendingScreenshot?.imageDataUrl ?? "";
}

/** In-popup preview only — never window.open(data:…) (Chrome blocks top-frame data URL navigation). */
async function openScreenshotLightbox() {
  const dataUrl = getScreenshotPreviewSrc();
  if (!dataUrl?.startsWith("data:image/")) return;

  const lightbox = $("lens-screenshot-lightbox");
  const full = $("lens-screenshot-full");
  if (!lightbox || !full) return;

  revokeScreenshotPreviewObjectUrl();
  try {
    const blob = await (await fetch(dataUrl)).blob();
    screenshotPreviewObjectUrl = URL.createObjectURL(blob);
    full.src = screenshotPreviewObjectUrl;
  } catch {
    full.src = dataUrl;
  }

  lightbox.hidden = false;
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("shot-lightbox-open");
  $("btn-screenshot-lightbox-x")?.focus();
}

function closeScreenshotLightbox() {
  const lightbox = $("lens-screenshot-lightbox");
  const full = $("lens-screenshot-full");
  if (!lightbox) return;

  lightbox.hidden = true;
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("shot-lightbox-open");
  revokeScreenshotPreviewObjectUrl();
  if (full) full.removeAttribute("src");
}

function guardScreenshotPreviewNavigation(event) {
  event.preventDefault();
  event.stopPropagation();
}

function openIivo(path = "/") {
  const url = path.startsWith("http") ? path : `${webBase}${path}`;
  chrome.runtime.sendMessage({ type: "IIVO_LENS_OPEN_APP", url });
}

function renderPreview(data) {
  const hasSelection = Boolean(data.selectedText?.trim());
  const previewSource = hasSelection ? data.selectedText : data.pageText;
  const charCount = previewSource?.length ?? 0;

  document.querySelector(".lens-popup")?.classList.toggle("has-selection", hasSelection);
  $("lens-page-title").textContent = data.title || "—";
  $("lens-page-domain").textContent = urlDomain(data.sourceUrl || "");
  $("lens-selection-status").textContent = hasSelection
    ? `${charCount.toLocaleString()} chars selected`
    : "None selected";
  $("lens-selection-status").hidden = !hasSelection;

  $("lens-preview-text").textContent = hasSelection
    ? previewSnippet(data.selectedText)
    : previewSnippet(data.pageText);

  const previewKicker = $("lens-preview-kicker-label");
  if (previewKicker) {
    previewKicker.textContent = hasSelection ? "Selected Text" : "Page Preview";
  }
  $("lens-char-count").textContent = `${charCount.toLocaleString()} characters`;

  const defaultType = hasSelection ? "Selection" : "Page context";
  $("lens-capture-type").textContent = defaultType;

  $("lens-truncation-warning").hidden = !data.truncated;

  const hints = [];
  hints.push("Send Selected Text → selected text only" + (hasSelection ? "" : " (disabled)"));
  hints.push(hasSelection ? "Ask IIVO → selection + metadata" : "Ask IIVO → full page context");
  hints.push("Save Evidence → Context Library");
  hints.push("Attach Context → opens IIVO with chip");
  hints.push("Send Screenshot → visible tab with confirmation");
  hints.push("Download PNG → save screenshot to your computer");
  $("lens-action-hints").textContent = hints.join(" · ");

  $("btn-send-selection").disabled = !hasSelection;
}

async function checkDuplicate(data) {
  recentDuplicate = null;
  $("lens-duplicate-warning").hidden = true;
  if (!iivoOnline) return;

  try {
    const items = await fetchContextItems();
    recentDuplicate = findRecentDuplicate(items, data.sourceUrl);
    if (recentDuplicate) {
      $("lens-duplicate-warning").hidden = false;
      $("lens-duplicate-text").textContent = "Sent recently";
    }
  } catch {
    /* duplicate hint is optional */
  }
}

async function ensureReady() {
  const online = await checkIivoHealth();
  if (!online) {
    setStatus(
      "Visit iivo.ai to check service status.",
      "error",
    );
    showOfflineActions(true);
    showPreview(false);
    setBusy(true);
    return false;
  }
  showOfflineActions(false);
  return true;
}

async function runAction(mode) {
  if (!capture) return;
  if (!(await ensureReady())) return;

  setBusy(true);
  setErrorDetail(null);
  setStatus("Sending to IIVO…", "muted");

  try {
    const payload = buildContextPayload(capture, mode);
    const item = await postContextItem(payload);

    if (mode === "ask") {
      setStatus("Sent to IIVO. Opening chat…", "success");
      openIivo(`/?lensAsk=${encodeURIComponent(item.id)}`);
    } else if (mode === "attach") {
      setStatus("Context attached in IIVO.", "success");
      openIivo(`/?lensContextId=${encodeURIComponent(item.id)}`);
    } else if (mode === "selection") {
      setStatus("Selected text sent to IIVO.", "success");
      openIivo(`/?lensContextId=${encodeURIComponent(item.id)}`);
    } else if (mode === "evidence") {
      setStatus("Saved to Context Library.", "success");
    }
  } catch (err) {
    setStatus(
      err instanceof Error
        ? err.message
        : "IIVO could not receive this context. Try again or paste the text manually.",
      "error",
    );
    if (err instanceof Error && err.detail) setErrorDetail(err.detail);
    else if (err instanceof Error) setErrorDetail(err.stack || err.message);
  } finally {
    setBusy(false);
    if (capture) {
      $("btn-send-selection").disabled = !capture.selectedText?.trim();
    }
  }
}

async function loadCaptureFlow() {
  setConnectionPill("checking", "Checking…");
  setStatus("Preparing page context…", "loading");
  setLoading(true);
  setErrorDetail(null);

  const online = await checkIivoHealth();
  if (!online) {
    setLoading(false);
    setStatus(null);
    await ensureReady();
    return;
  }

  try {
    capture = await captureActiveTab();
    renderPreview(capture);
    showPreview(true);
    showScreenshotConfirm(Boolean(pendingScreenshot));
    setStatus(null);
    await checkDuplicate(capture);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Capture failed.", "error");
    showPreview(false);
    showOfflineActions(false);
    setBusy(true);
    $("btn-open-iivo-offline").disabled = false;
  } finally {
    setLoading(false);
  }
}

function wireActions() {
  $("btn-ask-page").addEventListener("click", () => void runAction("ask"));
  $("btn-send-selection").addEventListener("click", () => void runAction("selection"));
  $("btn-save-evidence").addEventListener("click", () => void runAction("evidence"));
  $("btn-attach-page").addEventListener("click", () => void runAction("attach"));
  $("btn-open-iivo").addEventListener("click", () => openIivo("/"));
  $("btn-open-iivo-offline").addEventListener("click", () => openIivo("/"));
  $("btn-retry").addEventListener("click", () => void loadCaptureFlow());
  $("btn-open-existing").addEventListener("click", () => {
    if (recentDuplicate?.id) {
      openIivo(`/?lensContextId=${encodeURIComponent(recentDuplicate.id)}`);
      setStatus("Opening existing context in IIVO…", "success");
    }
  });
  $("btn-send-again")?.addEventListener("click", () => {
    $("lens-duplicate-warning").hidden = true;
    setStatus("Ready to send again.", "muted");
  });
  $("btn-send-screenshot").addEventListener("click", () => void startScreenshotCapture());
  $("btn-download-screenshot").addEventListener("click", () => void downloadPendingScreenshot());
  $("btn-ask-screenshot").addEventListener("click", () => void confirmScreenshot("ask"));
  $("btn-save-screenshot").addEventListener("click", () => void confirmScreenshot("save"));
  $("btn-cancel-screenshot").addEventListener("click", () => cancelScreenshot());
  const openScreenshotPreview = (event) => {
    guardScreenshotPreviewNavigation(event);
    void openScreenshotLightbox();
  };
  $("btn-screenshot-thumb")?.addEventListener("click", openScreenshotPreview);
  $("btn-screenshot-thumb")?.addEventListener("auxclick", guardScreenshotPreviewNavigation);
  $("btn-screenshot-expand")?.addEventListener("click", openScreenshotPreview);
  $("btn-screenshot-expand")?.addEventListener("auxclick", guardScreenshotPreviewNavigation);
  $("btn-screenshot-lightbox-close")?.addEventListener("click", () => closeScreenshotLightbox());
  $("btn-screenshot-lightbox-x")?.addEventListener("click", () => closeScreenshotLightbox());
  $("btn-screenshot-lightbox-download")?.addEventListener("click", () => void downloadPendingScreenshot());

  const settingsSheet = $("lens-settings-sheet");
  const openSettings = () => {
    if (settingsSheet) settingsSheet.hidden = false;
  };
  const closeSettings = () => {
    if (settingsSheet) settingsSheet.hidden = true;
  };
  const showMemoryInfo = () => {
    closeSettings();
    setStatus(
      "IIVO remembers your session locally so context survives between actions. Nothing sends until you click.",
      "muted",
    );
  };
  $("settingsButton")?.addEventListener("click", openSettings);
  $("footer-info")?.addEventListener("click", (event) => {
    event.stopPropagation();
    showMemoryInfo();
  });
  $("memory-footer")?.addEventListener("click", (event) => {
    if (event.target.closest("#footer-info")) return;
    showMemoryInfo();
  });
  $("settings-close")?.addEventListener("click", closeSettings);
  $("lens-status-dismiss")?.addEventListener("click", () => setStatus(null));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("lens-screenshot-lightbox")?.hidden) {
      closeScreenshotLightbox();
      return;
    }
    closeSettings();
  });
}

wireActions();
void loadCaptureFlow();
