/**
 * Context Bridge — screenshot storage (server)
 */

import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const { createContextItem, getContextItem, deleteContextItem } = await import(
  "../../dist/server/contextBridge/contextStore.js"
);
const { saveContextScreenshot, screenshotAbsolutePath } = await import(
  "../../dist/server/contextBridge/screenshotStore.js"
);
const { updateContextItem } = await import("../../dist/server/contextBridge/contextStore.js");

const item = await createContextItem({
  type: "screenshot",
  title: "Screenshot QA",
  sourceUrl: "https://example.com/screenshot-qa",
  contentText: "Screenshot captured from page: Screenshot QA",
  tags: ["lens", "browser", "screenshot"],
  capturedVia: "browser_lens",
  capturedAt: "2026-05-31T12:00:00.000Z",
  sourceConfidence: "screenshot",
  lensCaptureType: "screenshot",
  captureType: "visible_tab_screenshot",
  pageTitle: "Screenshot QA",
});

try {
  const saved = await saveContextScreenshot(item.id, TINY_PNG);
  const updated = await updateContextItem(item.id, {
    screenshotPath: saved.screenshotPath,
    imageMimeType: saved.imageMimeType,
    imageSizeBytes: saved.imageSizeBytes,
  });

  assert.equal(updated?.type, "screenshot");
  assert.equal(updated?.lensCaptureType, "screenshot");
  assert.equal(updated?.captureType, "visible_tab_screenshot");
  assert.equal(updated?.capturedVia, "browser_lens");
  assert.equal(updated?.imageMimeType, "image/png");
  assert.ok(updated?.imageSizeBytes && updated.imageSizeBytes > 0);
  assert.ok(updated?.screenshotPath?.startsWith("screenshots/"));

  const absolutePath = screenshotAbsolutePath(updated!.screenshotPath!);
  const stat = await fs.stat(absolutePath);
  assert.ok(stat.size > 0);

  const loaded = await getContextItem(item.id);
  assert.ok(loaded?.screenshotPath);

  console.log("contextScreenshot.test.ts: all assertions passed");
} finally {
  await deleteContextItem(item.id);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const maybeLeft = path.resolve(
    __dirname,
    "../../data/context/screenshots",
    `${item.id}.png`,
  );
  try {
    await fs.access(maybeLeft);
    assert.fail("Screenshot file should be deleted with context item");
  } catch {
    /* expected */
  }
}
