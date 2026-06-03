/**
 * Context Bridge — IIVO Lens metadata (server store)
 */

import assert from "node:assert/strict";

const { createContextItem, getContextItem, deleteContextItem } = await import(
  "../../dist/server/contextBridge/contextStore.js"
);

const item = await createContextItem({
  type: "url",
  title: "Lens QA Page",
  sourceUrl: "https://example.com/article",
  contentText: "Sample page text from IIVO Lens.",
  tags: ["lens", "browser", "page-context"],
  capturedVia: "browser_lens",
  capturedAt: "2026-05-31T12:00:00.000Z",
  sourceConfidence: "imported_url",
  lensCaptureType: "page",
  originalTextLength: 18_000,
  sentTextLength: 12_000,
  truncated: true,
});

try {
  assert.equal(item.capturedVia, "browser_lens");
  assert.equal(item.sourceConfidence, "imported_url");
  assert.ok(item.tags.includes("lens"));
  assert.equal(item.lensCaptureType, "page");
  assert.equal(item.truncated, true);
  assert.equal(item.originalTextLength, 18_000);
  assert.equal(item.sentTextLength, 12_000);

  const loaded = await getContextItem(item.id);
  assert.ok(loaded);
  assert.equal(loaded!.capturedVia, "browser_lens");
  assert.equal(loaded!.title, "Lens QA Page");
  assert.equal(loaded!.truncated, true);
  assert.equal(loaded!.originalTextLength, 18_000);
  assert.equal(loaded!.sentTextLength, 12_000);

  console.log("contextLens.test.ts: all assertions passed");
} finally {
  await deleteContextItem(item.id);
}
