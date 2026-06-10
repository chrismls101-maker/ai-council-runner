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
  sanitizeSourceUrl,
  isSensitiveHostname,
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

// ─── MAX_VISIBLE_TEXT_CHARS boundary ─────────────────────────────────────────

describe("getVisibleTextPayload — size guard boundary", () => {
  test("text at exactly MAX_VISIBLE_TEXT_CHARS is not truncated", () => {
    const text = "a".repeat(MAX_VISIBLE_TEXT_CHARS);
    const doc = { body: { innerText: text } };
    const result = getVisibleTextPayload(doc);
    assert.equal(result.truncated, false);
    assert.equal(result.sentTextLength, MAX_VISIBLE_TEXT_CHARS);
    assert.equal(result.originalTextLength, MAX_VISIBLE_TEXT_CHARS);
  });

  test("text at MAX_VISIBLE_TEXT_CHARS + 1 is truncated", () => {
    const text = "a".repeat(MAX_VISIBLE_TEXT_CHARS + 1);
    const doc = { body: { innerText: text } };
    const result = getVisibleTextPayload(doc);
    assert.equal(result.truncated, true);
    assert.equal(result.sentTextLength, MAX_VISIBLE_TEXT_CHARS);
    assert.equal(result.originalTextLength, MAX_VISIBLE_TEXT_CHARS + 1);
  });

  test("truncated payload appends the IIVO notice", () => {
    const text = "x".repeat(MAX_VISIBLE_TEXT_CHARS + 100);
    const doc = { body: { innerText: text } };
    const result = getVisibleTextPayload(doc);
    assert.ok(result.pageText.includes("[Page text truncated by IIVO Lens.]"));
  });
});

// ─── sanitizeSourceUrl ────────────────────────────────────────────────────────

describe("sanitizeSourceUrl", () => {
  test("strips access_token from query string", () => {
    const url = sanitizeSourceUrl("https://example.com/page?access_token=SECRET&foo=bar");
    assert.ok(!url.includes("access_token"));
    assert.ok(url.includes("foo=bar"));
  });

  test("strips code param (OAuth authorization code)", () => {
    const url = sanitizeSourceUrl("https://accounts.google.com/callback?code=AUTH_CODE&state=xyz");
    assert.ok(!url.includes("code="));
    assert.ok(!url.includes("AUTH_CODE"));
  });

  test("strips token, session, api_key, jwt", () => {
    const url = sanitizeSourceUrl(
      "https://example.com/?token=T&session=S&api_key=K&jwt=J&keep=yes",
    );
    assert.ok(!url.includes("token="));
    assert.ok(!url.includes("session="));
    assert.ok(!url.includes("api_key="));
    assert.ok(!url.includes("jwt="));
    assert.ok(url.includes("keep=yes"));
  });

  test("strips URL fragment (may contain implicit-flow tokens)", () => {
    const url = sanitizeSourceUrl("https://example.com/dashboard#access_token=SECRET&type=bearer");
    assert.ok(!url.includes("#"));
    assert.ok(!url.includes("SECRET"));
  });

  test("preserves path and non-sensitive params", () => {
    const url = sanitizeSourceUrl("https://example.com/path/to/page?runId=abc&tab=memory");
    assert.ok(url.includes("/path/to/page"));
    assert.ok(url.includes("runId=abc"));
    assert.ok(url.includes("tab=memory"));
  });

  test("returns input unchanged when no sensitive params present", () => {
    const input = "https://iivo.ai/dashboard?runId=abc";
    assert.equal(sanitizeSourceUrl(input), input);
  });

  test("returns href as-is when URL cannot be parsed", () => {
    assert.equal(sanitizeSourceUrl("not a url"), "not a url");
  });
});

// ─── isSensitiveHostname ─────────────────────────────────────────────────────

describe("isSensitiveHostname", () => {
  test("flags banking domains", () => {
    assert.equal(isSensitiveHostname("chase.com"), true);
    assert.equal(isSensitiveHostname("banking.myapp.com"), true);
    assert.equal(isSensitiveHostname("wellsfargo.com"), true);
  });

  test("flags password manager domains", () => {
    assert.equal(isSensitiveHostname("1password.com"), true);
    assert.equal(isSensitiveHostname("lastpass.com"), true);
    assert.equal(isSensitiveHostname("bitwarden.com"), true);
  });

  test("flags payment service domains", () => {
    assert.equal(isSensitiveHostname("paypal.com"), true);
    assert.equal(isSensitiveHostname("venmo.com"), true);
  });

  test("flags health/medical domains", () => {
    assert.equal(isSensitiveHostname("mychart.org"), true);
    assert.equal(isSensitiveHostname("myhealth.kaiser.com"), true);
  });

  test("does not flag normal productivity domains", () => {
    assert.equal(isSensitiveHostname("github.com"), false);
    assert.equal(isSensitiveHostname("notion.so"), false);
    assert.equal(isSensitiveHostname("iivo.ai"), false);
    assert.equal(isSensitiveHostname("news.ycombinator.com"), false);
  });
});

// ─── capturePageContext — security fields ─────────────────────────────────────

describe("capturePageContext — security fields", () => {
  function makeDoc(overrides = {}) {
    return {
      title: "Test page",
      body: { innerText: "Some visible text on the page." },
      querySelector: () => null,
      ...overrides,
    };
  }

  test("isSensitivePage is false for a normal page", () => {
    const win = { location: { href: "https://iivo.ai/dashboard" }, getSelection: () => null };
    const result = capturePageContext(makeDoc(), win);
    assert.equal(result.isSensitivePage, false);
  });

  test("isSensitivePage is true for a banking page", () => {
    const win = { location: { href: "https://chase.com/account" }, getSelection: () => null };
    const result = capturePageContext(makeDoc(), win);
    assert.equal(result.isSensitivePage, true);
  });

  test("sourceUrl has auth tokens stripped before leaving the browser", () => {
    const win = {
      location: { href: "https://example.com/callback?code=OAUTH_CODE&state=xyz" },
      getSelection: () => null,
    };
    const result = capturePageContext(makeDoc(), win);
    assert.ok(!result.sourceUrl.includes("OAUTH_CODE"));
    assert.ok(!result.sourceUrl.includes("code="));
  });

  test("sourceUrl fragment is stripped", () => {
    const win = {
      location: { href: "https://example.com/app#access_token=SECRET" },
      getSelection: () => null,
    };
    const result = capturePageContext(makeDoc(), win);
    assert.ok(!result.sourceUrl.includes("SECRET"));
    assert.ok(!result.sourceUrl.includes("#"));
  });

  test("capturePageContext includes isSensitivePage in output", () => {
    const win = { location: { href: "https://example.com/" }, getSelection: () => null };
    const result = capturePageContext(makeDoc(), win);
    assert.ok(Object.prototype.hasOwnProperty.call(result, "isSensitivePage"));
  });
});
