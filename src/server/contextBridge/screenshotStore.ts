import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.resolve(__dirname, "../../../data/context");
export const SCREENSHOTS_DIR = path.join(CONTEXT_DIR, "screenshots");

export const SCREENSHOT_RELATIVE_PREFIX = "screenshots/";

export function screenshotRelativePath(id: string): string {
  return `${SCREENSHOT_RELATIVE_PREFIX}${id}.png`;
}

export function screenshotAbsolutePath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, "");
  if (!normalized.startsWith(SCREENSHOT_RELATIVE_PREFIX)) {
    throw new Error("Invalid screenshot path");
  }
  return path.join(CONTEXT_DIR, normalized);
}

export async function ensureScreenshotsDir(): Promise<void> {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
}

export function parseScreenshotDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error("imageDataUrl must be a base64 data URL (image/png preferred)");
  }
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    throw new Error("Screenshot image is empty");
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Screenshot exceeds 8 MB limit");
  }
  return { buffer, mimeType };
}

export async function saveContextScreenshot(
  id: string,
  dataUrl: string,
): Promise<{ screenshotPath: string; imageMimeType: string; imageSizeBytes: number }> {
  await ensureScreenshotsDir();
  const { buffer, mimeType } = parseScreenshotDataUrl(dataUrl);
  const screenshotPath = screenshotRelativePath(id);
  const absolutePath = screenshotAbsolutePath(screenshotPath);
  await fs.writeFile(absolutePath, buffer);
  return {
    screenshotPath,
    imageMimeType: mimeType,
    imageSizeBytes: buffer.length,
  };
}

export async function deleteContextScreenshot(id: string): Promise<void> {
  const absolutePath = path.join(SCREENSHOTS_DIR, `${id}.png`);
  try {
    await fs.unlink(absolutePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function contextScreenshotExists(id: string): Promise<boolean> {
  try {
    await fs.access(path.join(SCREENSHOTS_DIR, `${id}.png`));
    return true;
  } catch {
    return false;
  }
}
