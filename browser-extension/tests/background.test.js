"use strict";

/**
 * IIVO Lens — background.js unit tests
 * Run: node --test tests/background.test.js
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const { DEFAULT_APP_URL, sanitizeAppUrl, createOpenAppHandler } = require("../lib/backgroundLogic");

// ─── createOpenAppHandler ─────────────────────────────────────────────────────

describe("createOpenAppHandler", () => {
  function makeHandler(createdUrls = []) {
    const tabsCreate = (props, cb) => {
      createdUrls.push(props.url);
      cb({ id: 1 });
    };
    return { handler: createOpenAppHandler(tabsCreate), createdUrls };
  }

  test("returns true (async) for IIVO_LENS_OPEN_APP message", () => {
    const { handler } = makeHandler();
    const result = handler({ type: "IIVO_LENS_OPEN_APP" }, {}, () => {});
    assert.equal(result, true);
  });

  test("returns false for unrecognized message type", () => {
    const { handler } = makeHandler();
    const result = handler({ type: "UNKNOWN_MSG" }, {}, () => {});
    assert.equal(result, false);
  });

  test("returns false for null message", () => {
    const { handler } = makeHandler();
    assert.equal(handler(null, {}, () => {}), false);
  });

  test("returns false for undefined message", () => {
    const { handler } = makeHandler();
    assert.equal(handler(undefined, {}, () => {}), false);
  });

  test("opens the URL from message.url", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP", url: "https://iivo.ai/dashboard?runId=abc" }, {}, () => {});
    assert.equal(createdUrls[0], "https://iivo.ai/dashboard?runId=abc");
  });

  test("falls back to DEFAULT_APP_URL when message.url is omitted", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP" }, {}, () => {});
    assert.equal(createdUrls[0], DEFAULT_APP_URL);
  });

  test("falls back to DEFAULT_APP_URL when message.url is empty string", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP", url: "" }, {}, () => {});
    assert.equal(createdUrls[0], DEFAULT_APP_URL);
  });

  test("calls sendResponse({ ok: true }) after tab creation", () => {
    const { handler } = makeHandler();
    let response = null;
    handler({ type: "IIVO_LENS_OPEN_APP" }, {}, (r) => { response = r; });
    assert.deepEqual(response, { ok: true });
  });

  test("DEFAULT_APP_URL is the iivo.ai root", () => {
    assert.equal(DEFAULT_APP_URL, "https://iivo.ai/");
  });

  // URL injection guard — handler must not open arbitrary URLs
  test("handler rejects non-iivo.ai URL and falls back to default", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP", url: "https://evil.com/steal" }, {}, () => {});
    assert.equal(createdUrls[0], DEFAULT_APP_URL);
  });

  test("handler rejects http:// URL (must be https)", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP", url: "http://iivo.ai/page" }, {}, () => {});
    assert.equal(createdUrls[0], DEFAULT_APP_URL);
  });

  test("handler rejects javascript: scheme URL", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP", url: "javascript:alert(1)" }, {}, () => {});
    assert.equal(createdUrls[0], DEFAULT_APP_URL);
  });

  test("handler rejects data: URL", () => {
    const { handler, createdUrls } = makeHandler();
    handler({ type: "IIVO_LENS_OPEN_APP", url: "data:text/html,<script>evil()</script>" }, {}, () => {});
    assert.equal(createdUrls[0], DEFAULT_APP_URL);
  });

  test("handler allows valid iivo.ai path with query string", () => {
    const { handler, createdUrls } = makeHandler();
    const target = "https://iivo.ai/?lensAsk=ctx-123";
    handler({ type: "IIVO_LENS_OPEN_APP", url: target }, {}, () => {});
    assert.equal(createdUrls[0], target);
  });
});

// ─── sanitizeAppUrl ───────────────────────────────────────────────────────────

describe("sanitizeAppUrl", () => {
  test("allows https://iivo.ai/ root", () => {
    assert.equal(sanitizeAppUrl("https://iivo.ai/"), "https://iivo.ai/");
  });

  test("allows https://iivo.ai path with query", () => {
    assert.equal(
      sanitizeAppUrl("https://iivo.ai/dashboard?runId=abc"),
      "https://iivo.ai/dashboard?runId=abc",
    );
  });

  test("rejects non-iivo.ai domain", () => {
    assert.equal(sanitizeAppUrl("https://evil.com/page"), DEFAULT_APP_URL);
  });

  test("rejects subdomain of iivo.ai (not trusted)", () => {
    assert.equal(sanitizeAppUrl("https://sub.iivo.ai/page"), DEFAULT_APP_URL);
  });

  test("rejects http:// (non-https)", () => {
    assert.equal(sanitizeAppUrl("http://iivo.ai/"), DEFAULT_APP_URL);
  });

  test("rejects javascript: scheme", () => {
    assert.equal(sanitizeAppUrl("javascript:alert(1)"), DEFAULT_APP_URL);
  });

  test("rejects empty string", () => {
    assert.equal(sanitizeAppUrl(""), DEFAULT_APP_URL);
  });

  test("rejects null", () => {
    assert.equal(sanitizeAppUrl(null), DEFAULT_APP_URL);
  });

  test("rejects undefined", () => {
    assert.equal(sanitizeAppUrl(undefined), DEFAULT_APP_URL);
  });

  test("strips embedded credentials from URL", () => {
    const result = sanitizeAppUrl("https://user:pass@iivo.ai/page");
    assert.ok(!result.includes("user:pass"));
    assert.ok(result.startsWith("https://iivo.ai"));
  });
});
