/**
 * Screenshot loader — vision prep (server)
 */

import assert from "node:assert/strict";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const { createContextItem, deleteContextItem } = await import(
  "../../dist/server/contextBridge/contextStore.js"
);
const { saveContextScreenshot } = await import(
  "../../dist/server/contextBridge/screenshotStore.js"
);
const {
  loadScreenshotForVision,
  ScreenshotLoaderError,
  MAX_VISION_IMAGE_BYTES,
} = await import("../../dist/server/contextBridge/screenshotLoader.js");
const { updateContextItem } = await import("../../dist/server/contextBridge/contextStore.js");

const item = await createContextItem({
  type: "screenshot",
  title: "Loader QA",
  sourceUrl: "https://example.com/loader",
  contentText: "Screenshot captured from page: Loader QA",
  tags: ["lens", "browser", "screenshot"],
  capturedVia: "browser_lens",
  lensCaptureType: "screenshot",
  captureType: "visible_tab_screenshot",
});

try {
  await assert.rejects(
    () => loadScreenshotForVision(item),
    (err: unknown) => err instanceof ScreenshotLoaderError,
  );

  const saved = await saveContextScreenshot(item.id, TINY_PNG);
  const withPath = await updateContextItem(item.id, {
    screenshotPath: saved.screenshotPath,
    imageMimeType: saved.imageMimeType,
    imageSizeBytes: saved.imageSizeBytes,
  });

  const loaded = await loadScreenshotForVision(withPath!);
  assert.equal(loaded.contextId, item.id);
  assert.ok(loaded.imageDataUrl.startsWith("data:image/png;base64,"));
  assert.ok(loaded.imageSizeBytes > 0);
  assert.ok(loaded.imageSizeBytes <= MAX_VISION_IMAGE_BYTES);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const bigPath = path.resolve(
    __dirname,
    "../../data/context/screenshots",
    `${item.id}-big.png`,
  );
  await fs.mkdir(path.dirname(bigPath), { recursive: true });
  await fs.writeFile(bigPath, Buffer.alloc(MAX_VISION_IMAGE_BYTES + 1));

  const bigItem = {
    ...withPath!,
    id: `${item.id}-big`,
    screenshotPath: `screenshots/${item.id}-big.png`,
  };

  await assert.rejects(
    () => loadScreenshotForVision(bigItem),
    (err: unknown) =>
      err instanceof ScreenshotLoaderError &&
      err.message.includes("too large for visual analysis"),
  );

  await fs.unlink(bigPath).catch(() => {});

  console.log("screenshotLoader.test.ts: all assertions passed");
} finally {
  await deleteContextItem(item.id);
}
