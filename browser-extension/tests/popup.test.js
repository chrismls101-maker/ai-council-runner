"use strict";

/**
 * IIVO Lens — browser-extension/popup.js unit tests
 * Uses Node.js built-in test runner (same as desktop-glass).
 *
 * Run: node --test tests/popup.test.js
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const {
  urlDomain,
  previewSnippet,
  estimateDataUrlBytes,
  buildScreenshotFilename,
  formatBytes,
  truncationFields,
  buildPageContent,
  buildContextPayload,
  buildScreenshotPayload,
  findRecentDuplicate,
  LENS_CAPTURED_VIA,
  MAX_SUMMARY,
  PREVIEW_CHARS,
  DUPLICATE_WINDOW_MS,
} = require("../lib/popupLogic");

// ─── urlDomain ────────────────────────────────────────────────────────────────

describe("urlDomain", () => {
  test("extracts hostname from https URL", () => {
    assert.equal(urlDomain("https://iivo.ai/dashboard"), "iivo.ai");
  });

  test("extracts hostname from http URL with path and query", () => {
    assert.equal(urlDomain("http://example.com/path?q=1"), "example.com");
  });

  test("returns raw string on invalid URL", () => {
    assert.equal(urlDomain("not-a-url"), "not-a-url");
  });

  test("handles empty string", () => {
    assert.equal(urlDomain(""), "");
  });
});

// ─── previewSnippet ───────────────────────────────────────────────────────────

describe("previewSnippet", () => {
  test("returns full text when within limit", () => {
    assert.equal(previewSnippet("hello world"), "hello world");
  });

  test("truncates with ellipsis beyond PREVIEW_CHARS", () => {
    const long = "a".repeat(PREVIEW_CHARS + 10);
    const result = previewSnippet(long);
    assert.equal(result.length, PREVIEW_CHARS + 1); // +1 for the ellipsis char
    assert.ok(result.endsWith("…"));
  });

  test("returns placeholder for empty string", () => {
    assert.equal(previewSnippet(""), "(No readable text detected)");
  });

  test("returns placeholder for null", () => {
    assert.equal(previewSnippet(null), "(No readable text detected)");
  });

  test("returns placeholder for undefined", () => {
    assert.equal(previewSnippet(undefined), "(No readable text detected)");
  });

  test("respects custom max parameter", () => {
    const result = previewSnippet("hello world", 5);
    assert.equal(result, "hello…");
  });
});

// ─── estimateDataUrlBytes ─────────────────────────────────────────────────────

describe("estimateDataUrlBytes", () => {
  test("estimates byte count from base64 data URL", () => {
    // base64("hello") = "aGVsbG8=" (8 chars) → ~6 bytes
    const dataUrl = "data:image/png;base64,aGVsbG8=";
    const bytes = estimateDataUrlBytes(dataUrl);
    assert.ok(bytes > 0 && bytes <= 8);
  });

  test("returns 0 for data URL with empty base64", () => {
    assert.equal(estimateDataUrlBytes("data:image/png;base64,"), 0);
  });

  test("returns 0 for malformed data URL with no comma", () => {
    assert.equal(estimateDataUrlBytes("no-comma-here"), 0);
  });
});

// ─── formatBytes ─────────────────────────────────────────────────────────────

describe("formatBytes", () => {
  test("formats bytes under 1024 as B", () => {
    assert.equal(formatBytes(512), "512 B");
  });

  test("formats bytes >= 1024 as KB with 1 decimal", () => {
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(2560), "2.5 KB");
  });
});

// ─── buildScreenshotFilename ──────────────────────────────────────────────────

describe("buildScreenshotFilename", () => {
  test("includes domain and timestamp in filename", () => {
    const name = buildScreenshotFilename({ sourceUrl: "https://github.com/repo" });
    assert.ok(name.startsWith("iivo-lens-github.com"));
    assert.ok(name.endsWith(".png"));
  });

  test("sanitizes special characters in domain", () => {
    const name = buildScreenshotFilename({ sourceUrl: "https://my.sub.domain.com/path" });
    assert.ok(/^iivo-lens-[a-z0-9.-]/.test(name));
    assert.ok(!name.includes("/"));
  });

  test("falls back to 'page' when no URL provided", () => {
    const name = buildScreenshotFilename({});
    assert.ok(name.startsWith("iivo-lens-page-"));
  });
});

// ─── truncationFields ─────────────────────────────────────────────────────────

describe("truncationFields", () => {
  test("returns non-truncated fields when data.truncated is false", () => {
    const fields = truncationFields({ truncated: false }, "hello world");
    assert.deepEqual(fields, {
      originalTextLength: 11,
      sentTextLength: 11,
      truncated: false,
    });
  });

  test("returns truncated fields when data.truncated is true", () => {
    const fields = truncationFields(
      { truncated: true, originalTextLength: 5000, sentTextLength: 2000 },
      "hello",
    );
    assert.deepEqual(fields, {
      originalTextLength: 5000,
      sentTextLength: 2000,
      truncated: true,
    });
  });

  test("falls back sentTextLength to contentText.length when not provided", () => {
    const fields = truncationFields({ truncated: true, originalTextLength: 9999 }, "hi");
    assert.equal(fields.sentTextLength, 2);
  });
});

// ─── buildPageContent ─────────────────────────────────────────────────────────

describe("buildPageContent", () => {
  test("combines metaDescription, selectedText, and pageText", () => {
    const content = buildPageContent({
      metaDescription: "About us",
      selectedText: "highlighted bit",
      pageText: "full page text",
    });
    assert.ok(content.includes("Description: About us"));
    assert.ok(content.includes("Selected text:\nhighlighted bit"));
    assert.ok(content.includes("Page text:\nfull page text"));
  });

  test("falls back to title when all text fields are empty", () => {
    assert.equal(buildPageContent({ title: "My Page" }), "My Page");
  });

  test("returns empty string when all fields missing", () => {
    assert.equal(buildPageContent({}), "");
  });
});

// ─── buildContextPayload ──────────────────────────────────────────────────────

describe("buildContextPayload", () => {
  const baseData = {
    title: "Test Page",
    sourceUrl: "https://example.com",
    pageText: "Some page text here",
    capturedAt: "2026-06-10T12:00:00.000Z",
    truncated: false,
  };

  test("selection mode produces pasted_text type", () => {
    const payload = buildContextPayload(
      { ...baseData, selectedText: "my selection" },
      "selection",
    );
    assert.equal(payload.type, "pasted_text");
    assert.equal(payload.contentText, "my selection");
    assert.equal(payload.sourceConfidence, "user_pasted");
    assert.equal(payload.lensCaptureType, "selection");
    assert.ok(payload.tags.includes("selected-text"));
  });

  test("ask mode produces url type", () => {
    const payload = buildContextPayload(baseData, "ask");
    assert.equal(payload.type, "url");
    assert.equal(payload.sourceConfidence, "imported_url");
    assert.equal(payload.lensCaptureType, "page");
  });

  test("evidence mode produces evidence type", () => {
    const payload = buildContextPayload(baseData, "evidence");
    assert.equal(payload.type, "evidence");
    assert.equal(payload.lensCaptureType, "evidence");
  });

  test("contentSummary is at most MAX_SUMMARY chars", () => {
    const long = { ...baseData, pageText: "x".repeat(1000) };
    const payload = buildContextPayload(long, "ask");
    assert.ok(payload.contentSummary.length <= MAX_SUMMARY);
  });

  test("capturedVia is always LENS_CAPTURED_VIA", () => {
    const payload = buildContextPayload(baseData, "ask");
    assert.equal(payload.capturedVia, LENS_CAPTURED_VIA);
  });
});

// ─── buildScreenshotPayload ───────────────────────────────────────────────────

describe("buildScreenshotPayload", () => {
  test("produces screenshot type with correct fields", () => {
    const payload = buildScreenshotPayload({
      title: "My Page",
      sourceUrl: "https://github.com",
      capturedAt: "2026-06-10T12:00:00.000Z",
    });
    assert.equal(payload.type, "screenshot");
    assert.equal(payload.lensCaptureType, "screenshot");
    assert.equal(payload.captureType, "visible_tab_screenshot");
    assert.equal(payload.capturedVia, LENS_CAPTURED_VIA);
    assert.ok(payload.title.startsWith("Screenshot:"));
    assert.ok(payload.contentText.includes("github.com"));
  });

  test("includes metaDescription in contentText when present", () => {
    const payload = buildScreenshotPayload({
      title: "Test",
      sourceUrl: "https://test.com",
      metaDescription: "A test site",
    });
    assert.ok(payload.contentText.includes("A test site"));
  });
});

// ─── findRecentDuplicate ──────────────────────────────────────────────────────

describe("findRecentDuplicate", () => {
  const recentTs = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
  const oldTs = new Date(Date.now() - DUPLICATE_WINDOW_MS - 60_000).toISOString(); // over 24h ago

  const item = {
    id: "abc",
    capturedVia: LENS_CAPTURED_VIA,
    sourceUrl: "https://example.com",
    capturedAt: recentTs,
  };

  test("finds a matching recent item", () => {
    const found = findRecentDuplicate([item], "https://example.com");
    assert.equal(found?.id, "abc");
  });

  test("ignores items captured by a different source", () => {
    const other = { ...item, capturedVia: "manual" };
    assert.equal(findRecentDuplicate([other], "https://example.com"), undefined);
  });

  test("ignores items with a different URL", () => {
    assert.equal(findRecentDuplicate([item], "https://other.com"), undefined);
  });

  test("ignores items older than DUPLICATE_WINDOW_MS", () => {
    const old = { ...item, capturedAt: oldTs };
    assert.equal(findRecentDuplicate([old], "https://example.com"), undefined);
  });

  test("returns undefined for empty list", () => {
    assert.equal(findRecentDuplicate([], "https://example.com"), undefined);
  });

  test("trims whitespace from sourceUrl before comparing", () => {
    const found = findRecentDuplicate([item], "  https://example.com  ");
    assert.equal(found?.id, "abc");
  });
});
