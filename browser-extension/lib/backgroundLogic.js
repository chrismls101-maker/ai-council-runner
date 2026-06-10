"use strict";

/**
 * IIVO Lens — background service worker pure logic, extracted for testability.
 * The actual background.js registers this handler with chrome.runtime.onMessage.
 */

const DEFAULT_APP_URL = "https://iivo.ai/";

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
      const url = message.url || DEFAULT_APP_URL;
      tabsCreate({ url }, () => sendResponse({ ok: true }));
      return true; // keep message channel open for async sendResponse
    }
    return false;
  };
}

module.exports = {
  DEFAULT_APP_URL,
  createOpenAppHandler,
};
