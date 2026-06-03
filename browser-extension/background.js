/**
 * IIVO Lens — background service worker (opens IIVO app tabs).
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "IIVO_LENS_OPEN_APP") {
    const url = message.url || "http://localhost:5173/";
    chrome.tabs.create({ url }, () => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
