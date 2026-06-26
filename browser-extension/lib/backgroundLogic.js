"use strict";

/**
 * IIVO Lens — background service worker pure logic, extracted for testability.
 * The actual background.js registers this handler with chrome.runtime.onMessage.
 */

const DEFAULT_APP_URL = "https://iivo.ai/";

/**
 * Validates that a URL is safe to open — must be https://iivo.ai/* only.
 * Prevents a compromised or malicious page from using IIVO_LENS_OPEN_APP
 * as an open redirect to an arbitrary URL.
 *
 * @param {unknown} url
 * @returns {string} sanitized iivo.ai URL
 */
function sanitizeAppUrl(url) {
  if (typeof url !== "string" || !url.trim()) return DEFAULT_APP_URL;
  try {
    const parsed = new URL(url);
    // Allow only https scheme and exact iivo.ai host.
    // Subdomains are intentionally blocked — only the root production host is trusted.
    if (parsed.protocol !== "https:" || parsed.hostname !== "iivo.ai") {
      return DEFAULT_APP_URL;
    }
    // Strip credentials if somehow present (URL spec allows user:pass@host)
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return DEFAULT_APP_URL;
  }
}

/**
 * Returns the message handler function that background.js registers.
 * Accepts a `tabsCreate` function so tests can inject a mock.
 *
 * @param {(createProps: {url: string}, cb: (tab: object) => void) => void} tabsCreate
 * @returns {(message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean}
 */
function createOpenAppHandler(tabsCreate) {
  return function handleMessage(message, _sender, sendResponse) {
    if (message?.type === "IIVO_LENS_OPEN_APP") {
      const url = sanitizeAppUrl(message.url);
      tabsCreate({ url }, () => sendResponse({ ok: true }));
      return true; // keep message channel open for async sendResponse
    }
    return false;
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_APP_URL,
    sanitizeAppUrl,
    createOpenAppHandler,
  };
}

if (typeof self !== "undefined") {
  self.sanitizeAppUrl = sanitizeAppUrl;
  self.createOpenAppHandler = createOpenAppHandler;
}
