/**
 * IIVO Lens — Pure logic extracted from popup.js
 *
 * These functions are dependency-free (no DOM, no chrome.* APIs) and are
 * exported for use in Node.js tests via module.exports.
 */

"use strict";

const MAX_SUMMARY = 280;
const PREVIEW_CHARS = 420;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LENS_CAPTURED_VIA = "browser_lens";

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the hostname of a URL string, or the raw string on parse failure.
 * @param {string} sourceUrl
 * @returns {string}
 */
function urlDomain(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a preview snippet of text, truncating at `max` chars with an ellipsis.
 * Returns a placeholder string when input is empty.
 * @param {string | null | undefined} text
 * @param {number} [max]
 * @returns {string}
 */
function previewSnippet(text, max = PREVIEW_CHARS) {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "(No readable text detected)";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

// ─── Screenshot helpers ───────────────────────────────────────────────────────

/**
 * Estimates the byte size of a base64 data URL payload.
 * @param {string} dataUrl
 * @returns {number}
 */
function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Builds a safe filename for a screenshot based on the page domain and timestamp.
 * @param {{ sourceUrl?: string }} meta
 * @returns {string}
 */
function buildScreenshotFilename(meta) {
  const domain = urlDomain(meta?.sourceUrl || "page")
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "page";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `iivo-lens-${domain}-${stamp}.png`;
}

/**
 * Formats a byte count as a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── Truncation metadata ──────────────────────────────────────────────────────

/**
 * Returns truncation metadata fields to embed in a context payload.
 * @param {{ truncated?: boolean; originalTextLength?: number; sentTextLength?: number }} data
 * @param {string} contentText
 * @returns {object}
 */
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

// ─── Page content builder ─────────────────────────────────────────────────────

/**
 * Assembles a plain-text content string from captured page data.
 * @param {{ metaDescription?: string; selectedText?: string; pageText?: string; title?: string }} data
 * @returns {string}
 */
function buildPageContent(data) {
  const parts = [];
  if (data.metaDescription) parts.push(`Description: ${data.metaDescription}`);
  if (data.selectedText) parts.push(`Selected text:\n${data.selectedText}`);
  if (data.pageText) parts.push(`Page text:\n${data.pageText}`);
  return parts.join("\n\n").trim() || data.title || "";
}

// ─── Context payload builders ─────────────────────────────────────────────────

/**
 * Builds the context payload for a page/selection/evidence capture.
 * @param {object} data
 * @param {"ask" | "selection" | "evidence" | "attach"} mode
 * @returns {object}
 */
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

/**
 * Builds the context payload for a screenshot capture.
 * @param {{ title?: string; sourceUrl?: string; capturedAt?: string; metaDescription?: string }} data
 * @returns {object}
 */
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

// ─── Duplicate detection ──────────────────────────────────────────────────────

/**
 * Finds a recent context item that matches the given URL within the dedup window.
 * @param {Array<{ capturedVia?: string; sourceUrl?: string; capturedAt?: string; createdAt?: string; id?: string }>} items
 * @param {string} sourceUrl
 * @returns {object | undefined}
 */
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

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  MAX_SUMMARY,
  PREVIEW_CHARS,
  DUPLICATE_WINDOW_MS,
  LENS_CAPTURED_VIA,
  // URL / text
  urlDomain,
  previewSnippet,
  // Screenshot
  estimateDataUrlBytes,
  buildScreenshotFilename,
  formatBytes,
  // Payload builders
  truncationFields,
  buildPageContent,
  buildContextPayload,
  buildScreenshotPayload,
  // Dedup
  findRecentDuplicate,
};
