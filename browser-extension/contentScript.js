/**
 * IIVO Lens — page capture (runs only on http/https pages user visits).
 */

const MAX_VISIBLE_TEXT_CHARS = 12_000;

function stripWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getSelectedText() {
  try {
    return window.getSelection()?.toString().trim() ?? "";
  } catch {
    return "";
  }
}

function getMetaDescription() {
  const el =
    document.querySelector('meta[name="description"]') ||
    document.querySelector('meta[property="og:description"]');
  const content = el?.getAttribute("content")?.trim();
  return content || undefined;
}

function getVisibleTextPayload() {
  try {
    const raw = document.body?.innerText ?? "";
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

function capturePageContext() {
  const selectedText = getSelectedText();
  const pagePayload = getVisibleTextPayload();
  const title = document.title?.trim() || "Untitled page";
  const sourceUrl = location.href;

  return {
    title,
    sourceUrl,
    selectedText,
    pageText: pagePayload.pageText,
    originalTextLength: pagePayload.originalTextLength,
    sentTextLength: pagePayload.sentTextLength,
    truncated: pagePayload.truncated,
    metaDescription: getMetaDescription(),
    capturedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "IIVO_LENS_CAPTURE") {
    try {
      sendResponse({ ok: true, data: capturePageContext() });
    } catch (err) {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : "Capture failed",
      });
    }
    return true;
  }
  return false;
});
