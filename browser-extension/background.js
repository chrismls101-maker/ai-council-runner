/**
 * IIVO Lens — background service worker (opens IIVO app tabs).
 */

importScripts("lib/backgroundLogic.js");

chrome.runtime.onMessage.addListener(
  createOpenAppHandler((props, cb) => {
    chrome.tabs.create(props, cb);
  }),
);
