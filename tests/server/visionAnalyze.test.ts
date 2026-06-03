/**
 * Vision analyze endpoint — disabled config (server)
 */

import assert from "node:assert/strict";
import http from "node:http";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const { createContextItem, deleteContextItem } = await import(
  "../../dist/server/contextBridge/contextStore.js"
);
const { saveContextScreenshot } = await import(
  "../../dist/server/contextBridge/screenshotStore.js"
);
const { updateContextItem } = await import("../../dist/server/contextBridge/contextStore.js");
const { getImageVisionConfig } = await import("../../dist/server/config/vision.js");
const { default: dotenv } = await import("dotenv");
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

const config = getImageVisionConfig();
if (config.configured) {
  console.log("visionAnalyze.test.ts: skipped — IMAGE_VISION_ENABLED is configured in env");
  process.exit(0);
}

const item = await createContextItem({
  type: "screenshot",
  title: "Vision analyze QA",
  sourceUrl: "https://example.com/vision-analyze",
  contentText: "Screenshot captured from page: Vision analyze QA",
  tags: ["lens", "browser", "screenshot"],
  capturedVia: "browser_lens",
  lensCaptureType: "screenshot",
  captureType: "visible_tab_screenshot",
});

const saved = await saveContextScreenshot(item.id, TINY_PNG);
await updateContextItem(item.id, {
  screenshotPath: saved.screenshotPath,
  imageMimeType: saved.imageMimeType,
  imageSizeBytes: saved.imageSizeBytes,
});

function requestJson(
  port: number,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
          });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

try {
  const healthRes = await fetch("http://localhost:3001/api/health");
  if (!healthRes.ok) {
    console.log("visionAnalyze.test.ts: skipped — server not running on :3001");
    process.exit(0);
  }

  const visionRes = await fetch("http://localhost:3001/api/config/vision");
  if (visionRes.ok) {
    const serverVision = (await visionRes.json()) as { configured?: boolean };
    if (serverVision.configured) {
      console.log("visionAnalyze.test.ts: skipped — server vision is configured");
      process.exit(0);
    }
  }

  const res = await requestJson(
    3001,
    "POST",
    `/api/context/${item.id}/analyze-screenshot`,
    { prompt: "Analyze this screenshot." },
  );

  assert.equal(res.status, 503);
  assert.match(String(res.body.error ?? ""), /not configured|disabled/i);
  assert.equal((res.body.vision as { configured?: boolean } | undefined)?.configured, false);

  const exported = JSON.stringify(res.body);
  assert.ok(!exported.includes(TINY_PNG.slice(20, 80)));

  console.log("visionAnalyze.test.ts: all assertions passed");
} finally {
  await deleteContextItem(item.id);
}
