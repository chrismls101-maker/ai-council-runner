/**
 * IIVO Lens — duplicate detection helper (server)
 */

import assert from "node:assert/strict";
import {
  findRecentLensDuplicate,
  LENS_DUPLICATE_WINDOW_MS,
  resolveLensCaptureType,
} from "../../dist/server/contextBridge/lensUtils.js";
import type { ContextItem } from "../../dist/server/contextBridge/types.js";

function lensItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: "ctx-1",
    type: "url",
    title: "Example Page",
    sourceUrl: "https://example.com/article",
    contentText: "Sample text",
    contentSummary: "Sample",
    tags: ["lens", "browser", "page-context"],
    capturedVia: "browser_lens",
    capturedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceConfidence: "imported_url",
    savedToMemory: false,
    project: "",
    ...overrides,
  };
}

const now = Date.parse("2026-05-31T18:00:00.000Z");

const recent = lensItem({
  id: "recent",
  capturedAt: "2026-05-31T17:00:00.000Z",
  createdAt: "2026-05-31T17:00:00.000Z",
});

const old = lensItem({
  id: "old",
  capturedAt: "2026-05-29T12:00:00.000Z",
  createdAt: "2026-05-29T12:00:00.000Z",
});

const otherUrl = lensItem({
  id: "other",
  sourceUrl: "https://other.example/page",
  capturedAt: "2026-05-31T17:30:00.000Z",
});

const nonLens = lensItem({
  id: "manual",
  capturedVia: undefined,
  capturedAt: "2026-05-31T17:30:00.000Z",
});

assert.equal(
  findRecentLensDuplicate([recent, old, otherUrl, nonLens], "https://example.com/article", {
    now,
    windowMs: LENS_DUPLICATE_WINDOW_MS,
  })?.id,
  "recent",
);

assert.equal(
  findRecentLensDuplicate([old], "https://example.com/article", { now, windowMs: LENS_DUPLICATE_WINDOW_MS }),
  undefined,
);

assert.equal(
  findRecentLensDuplicate([recent], "https://example.com/article", {
    now: Date.parse("2026-06-02T00:00:00.000Z"),
    windowMs: LENS_DUPLICATE_WINDOW_MS,
  }),
  undefined,
);

assert.equal(resolveLensCaptureType({ type: "url", tags: ["page-context"], lensCaptureType: "page" }), "page");
assert.equal(
  resolveLensCaptureType({ type: "pasted_text", tags: ["selected-text"], lensCaptureType: "selection" }),
  "selection",
);
assert.equal(resolveLensCaptureType({ type: "evidence", tags: [], lensCaptureType: "evidence" }), "evidence");
assert.equal(resolveLensCaptureType({ type: "screenshot", tags: [], lensCaptureType: "screenshot" }), "screenshot");

console.log("lensDuplicates.test.ts: all assertions passed");
