/**
 * Render local HTML fixture pages to PNG data URLs for controlled visual QA.
 */

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * @param {string} absPath Absolute path to fixture HTML
 * @param {{ width?: number, height?: number }} [options]
 * @returns {Promise<string>} data:image/png;base64,...
 */
export async function renderFixtureScreenshot(absPath, options = {}) {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const cacheKey = `${absPath}:${width}x${height}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(pathToFileURL(absPath).href, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(150);
    const buf = await page.screenshot({ type: "png", fullPage: false });
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    cache.set(cacheKey, dataUrl);
    return dataUrl;
  } finally {
    await browser.close();
  }
}
