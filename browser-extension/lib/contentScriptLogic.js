"use strict";

/**
 * IIVO Lens — content script pure logic, extracted for testability.
 * The actual contentScript.js registers the chrome message listener and
 * delegates to these functions.
 */

const MAX_VISIBLE_TEXT_CHARS = 12_000;

// ─── Sensitive page detection ─────────────────────────────────────────────────

/**
 * Query params that may carry auth tokens, OAuth codes, or session secrets.
 * These are stripped from sourceUrl before it leaves the browser.
 */
const SENSITIVE_PARAMS = new Set([
  "token", "access_token", "refresh_token", "id_token",
  "code", "state", "session", "session_id", "sessionid",
  "auth", "auth_token", "apikey", "api_key", "key",
  "secret", "client_secret", "password", "passwd",
  "jwt", "bearer",
]);

/**
 * Domain patterns that indicate a page likely contains financial,
 * authentication, or medical data. Used to surface a warning in the popup
 * before the user sends a capture. Does NOT block capture — it is the user's
 * choice.
 *
 * Pattern matching: string anywhere in hostname.
 */
const SENSITIVE_DOMAIN_PATTERNS = [
  "bank", "banking", "chase", "wellsfargo", "bofa", "bankofamerica",
  "citibank", "barclays", "hsbc", "schwab", "fidelity", "vanguard",
  "paypal", "venmo", "cashapp", "zelle", "stripe", "square",
  "1password", "lastpass", "bitwarden", "dashlane", "keychain",
  "accounts.google", "login.microsoftonline", "signin.aws",
  "mychart", "myhealth", "patient", "health", "hospital", "clinic",
  "irs.gov", "ssa.gov", "gov.uk",
];

/**
 * Returns true if the hostname looks like a sensitive/financial/auth domain.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isSensitiveHostname(hostname) {
  const lower = hostname.toLowerCase();
  return SENSITIVE_DOMAIN_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Strips query parameters that may carry auth tokens or secrets from a URL.
 * The path, host, and non-sensitive query params are preserved.
 *
 * @param {string} href
 * @returns {string} sanitized URL
 */
function sanitizeSourceUrl(href) {
  try {
    const url = new URL(href);
    const toDelete = [];
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      url.searchParams.delete(key);
    }
    // Also strip the fragment — it can contain OAuth implicit-flow tokens
    url.hash = "";
    return url.toString();
  } catch {
    return href;
  }
}

// ─── Core capture logic ───────────────────────────────────────────────────────

function stripWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getSelectedText(win = globalThis) {
  try {
    return win.getSelection?.()?.toString().trim() ?? "";
  } catch {
    return "";
  }
}

function getMetaDescription(doc = globalThis.document) {
  const el =
    doc.querySelector('meta[name="description"]') ||
    doc.querySelector('meta[property="og:description"]');
  const content = el?.getAttribute("content")?.trim();
  return content || undefined;
}

function getVisibleTextPayload(doc = globalThis.document) {
  try {
    const raw = doc.body?.innerText ?? "";
    const cleaned = stripWhitespace(raw);
    const originalLength = cleaned.length;
    if (originalLength <= MAX_VISIBLE_TEXT_CHARS) {
      return {
        pageText: cleaned,
        originalTextLength: originalLength,
        sentTextLength: originalLength,
        truncated: false,
      };
    }
    const slice = cleaned.slice(0, MAX_VISIBLE_TEXT_CHARS);
    return {
      pageText: `${slice}\n\n[Page text truncated by IIVO Lens.]`,
      originalTextLength: originalLength,
      sentTextLength: slice.length,
      truncated: true,
    };
  } catch {
    return {
      pageText: "",
      originalTextLength: 0,
      sentTextLength: 0,
      truncated: false,
    };
  }
}

function capturePageContext(doc = globalThis.document, win = globalThis) {
  const selectedText = getSelectedText(win);
  const pagePayload = getVisibleTextPayload(doc);
  const title = doc.title?.trim() || "Untitled page";
  const rawUrl = (win.location || { href: "" }).href;
  const sourceUrl = sanitizeSourceUrl(rawUrl);

  let isSensitivePage = false;
  try {
    isSensitivePage = isSensitiveHostname(new URL(rawUrl).hostname);
  } catch {
    // non-parseable URL — treat as safe
  }

  return {
    title,
    sourceUrl,
    selectedText,
    pageText: pagePayload.pageText,
    originalTextLength: pagePayload.originalTextLength,
    sentTextLength: pagePayload.sentTextLength,
    truncated: pagePayload.truncated,
    metaDescription: getMetaDescription(doc),
    capturedAt: new Date().toISOString(),
    isSensitivePage,
  };
}

module.exports = {
  MAX_VISIBLE_TEXT_CHARS,
  SENSITIVE_PARAMS,
  stripWhitespace,
  getSelectedText,
  getMetaDescription,
  getVisibleTextPayload,
  sanitizeSourceUrl,
  isSensitiveHostname,
  capturePageContext,
};
