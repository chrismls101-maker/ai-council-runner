"use strict";

/**
 * IIVO Lens — background.js unit tests
 * Run: node --test tests/background.test.js
 */

const assert = require("node:assert/strict");
const { test, describe } = require("node:test");
const { DEFAULT_APP_URL, createOpenAppHandler } = require("../lib/backgroundLogic");

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
});
