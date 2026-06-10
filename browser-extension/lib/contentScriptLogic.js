"use strict";

/**
 * IIVO Lens — content script pure logic, extracted for testability.
 * The actual contentScript.js registers the chrome message listener and
 * delegates to these functions.
 */

const MAX_VISIBLE_TEXT_CHARS = 12_000;

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
  const sourceUrl = (win.location || { href: "" }).href;

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
  };
}

module.exports = {
  MAX_VISIBLE_TEXT_CHARS,
  stripWhitespace,
  getSelectedText,
  getMetaDescription,
  getVisibleTextPayload,
  capturePageContext,
};
