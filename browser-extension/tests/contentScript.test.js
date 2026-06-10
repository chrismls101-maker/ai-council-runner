"use strict";

/**
 * IIVO Lens — contentScript.js unit tests
 * Run: node --test tests/contentScript.test.js
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const {
  MAX_VISIBLE_TEXT_CHARS,
  stripWhitespace,
  getSelectedText,
  getMetaDescription,
  getVisibleTextPayload,
  capturePageContext,
} = require("../lib/contentScriptLogic");

// ─── stripWhitespace ──────────────────────────────────────────────────────────

describe("stripWhitespace", () => {
  test("collapses multiple spaces into one", () => {
    assert.equal(stripWhitespace("a  b   c"), "a b c");
  });

  test("collapses newlines and tabs", () => {
    assert.equal(stripWhitespace("a\n\n\tb"), "a b");
  });

  test("trims leading and trailing whitespace", () => {
    assert.equal(stripWhitespace("  hello world  "), "hello world");
  });

  test("returns empty string unchanged", () => {
    assert.equal(stripWhitespace(""), "");
  });

  test("handles string that is only whitespace", () => {
    assert.equal(stripWhitespace("   \t\n  "), "");
  });
});

// ─── getSelectedText ──────────────────────────────────────────────────────────

describe("getSelectedText", () => {
  test("returns trimmed selection text", () => {
    const mockWin = { getSelection: () => ({ toString: () => "  hello  " }) };
    assert.equal(getSelectedText(mockWin), "hello");
  });

  test("returns empty string when selection is null", () => {
    const mockWin = { getSelection: () => null };
    assert.equal(getSelectedText(mockWin), "");
  });

  test("returns empty string when getSelection throws", () => {
    const mockWin = {
      getSelection: () => {
        throw new Error("security error");
      },
    };
    assert.equal(getSelectedText(mockWin), "");
  });

  test("returns empty string when getSelection is absent", () => {
    assert.equal(getSelectedText({}), "");
  });
});

// ─── getMetaDescription ───────────────────────────────────────────────────────

describe("getMetaDescription", () => {
  test("returns description from meta[name=description]", () => {
    const mockDoc = {
      querySelector: (sel) => {
        if (sel === 'meta[name="description"]')
          return { getAttribute: () => "My site description" };
        return null;
      },
    };
    assert.equal(getMetaDescription(mockDoc), "My site description");
  });

  test("falls back to og:description when name description is absent", () => {
    const mockDoc = {
      querySelector: (sel) => {
        if (sel === 'meta[property="og:description"]')
          return { getAttribute: () => "OG description" };
        return null;
      },
    };
    assert.equal(getMetaDescription(mockDoc), "OG description");
  });

  test("returns undefined when no meta description", () => {
    const mockDoc = { querySelector: () => null };
    assert.equal(getMetaDescription(mockDoc), undefined);
  });

  test("returns undefined when content is empty string", () => {
    const mockDoc = {
      querySelector: () => ({ getAttribute: () => "" }),
    };
    assert.equal(getMetaDescription(mockDoc), undefined);
  });
});

// ─── getVisibleTextPayload ────────────────────────────────────────────────────

describe("getVisibleTextPayload", () => {
  test("returns full text when under limit", () => {
    const text = "Hello world";
    const mockDoc = { body: { innerText: text } };
    const result = getVisibleTextPayload(mockDoc);
    assert.equal(result.pageText, text);
    assert.equal(result.truncated, false);
    assert.equal(result.originalTextLength, text.length);
    assert.equal(result.sentTextLength, text.length);
  });

  test("truncates text over MAX_VISIBLE_TEXT_CHARS and adds notice", () => {
    const longText = "a".repeat(MAX_VISIBLE_TEXT_CHARS + 500);
    const mockDoc = { body: { innerText: longText } };
    const result = getVisibleTextPayload(mockDoc);
    assert.equal(result.truncated, true);
    assert.equal(result.originalTextLength, MAX_VISIBLE_TEXT_CHARS + 500);
    assert.equal(result.sentTextLength, MAX_VISIBLE_TEXT_CHARS);
    assert.ok(result.pageText.includes("[Page text truncated by IIVO Lens.]"));
  });

  test("text of exactly MAX_VISIBLE_TEXT_CHARS is NOT truncated", () => {
    const text = "b".repeat(MAX_VISIBLE_TEXT_CHARS);
    const mockDoc = { body: { innerText: text } };
    const result = getVisibleTextPayload(mockDoc);
    assert.equal(result.truncated, false);
  });

  test("handles missing body gracefully", () => {
    const mockDoc = { body: null };
    const result = getVisibleTextPayload(mockDoc);
    assert.equal(result.pageText, "");
    assert.equal(result.truncated, false);
    assert.equal(result.originalTextLength, 0);
  });

  test("collapses whitespace in page text", () => {
    const mockDoc = { body: { innerText: "a   b\n\nc" } };
    const result = getVisibleTextPayload(mockDoc);
    assert.equal(result.pageText, "a b c");
  });
});

// ─── capturePageContext ───────────────────────────────────────────────────────

describe("capturePageContext", () => {
  function makeDoc(overrides = {}) {
    return {
      title: "Test Page",
      body: { innerText: "page content" },
      querySelector: () => null,
      ...overrides,
    };
  }

  function makeWin(overrides = {}) {
    return {
      getSelection: () => ({ toString: () => "" }),
      location: { href: "https://example.com/path" },
      ...overrides,
    };
  }

  test("includes title, sourceUrl, pageText", () => {
    const result = capturePageContext(makeDoc(), makeWin());
    assert.equal(result.title, "Test Page");
    assert.equal(result.sourceUrl, "https://example.com/path");
    assert.equal(result.pageText, "page content");
  });

  test("falls back to 'Untitled page' when title is empty", () => {
    const result = capturePageContext(makeDoc({ title: "" }), makeWin());
    assert.equal(result.title, "Untitled page");
  });

  test("includes selected text from window.getSelection", () => {
    const win = makeWin({
      getSelection: () => ({ toString: () => "  selected snippet  " }),
    });
    const result = capturePageContext(makeDoc(), win);
    assert.equal(result.selectedText, "selected snippet");
  });

  test("capturedAt is a valid ISO string", () => {
    const result = capturePageContext(makeDoc(), makeWin());
    assert.ok(!isNaN(Date.parse(result.capturedAt)));
  });

  test("includes truncated flag and length fields", () => {
    const result = capturePageContext(makeDoc(), makeWin());
    assert.equal(typeof result.truncated, "boolean");
    assert.equal(typeof result.originalTextLength, "number");
    assert.equal(typeof result.sentTextLength, "number");
  });

  test("metaDescription is undefined when no meta tag", () => {
    const result = capturePageContext(makeDoc(), makeWin());
    assert.equal(result.metaDescription, undefined);
  });

  test("metaDescription is populated when meta tag present", () => {
    const doc = makeDoc({
      querySelector: (sel) => {
        if (sel === 'meta[name="description"]')
          return { getAttribute: () => "Site description" };
        return null;
      },
    });
    const result = capturePageContext(doc, makeWin());
    assert.equal(result.metaDescription, "Site description");
  });
});
