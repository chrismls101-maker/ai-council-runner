import { promises as fs } from "fs";
import type { ContextItem } from "./types.js";
import { getContextItem } from "./contextStore.js";
import {
  contextScreenshotExists,
  screenshotAbsolutePath,
} from "./screenshotStore.js";

export const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024;

export class ScreenshotLoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenshotLoaderError";
  }
}

export interface LoadedScreenshotImage {
  contextId: string;
  title: string;
  sourceUrl?: string;
  pageTitle?: string;
  captureType?: string;
  imageMimeType: string;
  imageSizeBytes: number;
  /** Data URL for provider vision calls only — do not log or export. */
  imageDataUrl: string;
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function loadScreenshotForVision(item: ContextItem): Promise<LoadedScreenshotImage> {
  if (item.type !== "screenshot") {
    throw new ScreenshotLoaderError("Context item is not a screenshot.");
  }
  if (!item.screenshotPath) {
    throw new ScreenshotLoaderError("Screenshot file path is missing for this context item.");
  }

  const exists = await contextScreenshotExists(item.id);
  if (!exists) {
    throw new ScreenshotLoaderError("Screenshot file was not found on disk.");
  }

  const absolutePath = screenshotAbsolutePath(item.screenshotPath);
  const buffer = await fs.readFile(absolutePath);
  const mimeType = item.imageMimeType ?? "image/png";

  if (!mimeType.startsWith("image/")) {
    throw new ScreenshotLoaderError("Screenshot MIME type is invalid.");
  }

  if (buffer.length > MAX_VISION_IMAGE_BYTES) {
    throw new ScreenshotLoaderError("Screenshot is too large for visual analysis.");
  }

  if (buffer.length === 0) {
    throw new ScreenshotLoaderError("Screenshot file is empty.");
  }

  return {
    contextId: item.id,
    title: item.title,
    sourceUrl: item.sourceUrl,
    pageTitle: item.pageTitle,
    captureType: item.captureType,
    imageMimeType: mimeType,
    imageSizeBytes: buffer.length,
    imageDataUrl: bufferToDataUrl(buffer, mimeType),
  };
}

export async function loadScreenshotForVisionById(id: string): Promise<LoadedScreenshotImage> {
  const item = await getContextItem(id);
  if (!item) {
    throw new ScreenshotLoaderError("Context item not found.");
  }
  return loadScreenshotForVision(item);
}

export async function resolveScreenshotContextItems(
  attachments: Array<{ id: string; type: string; savedToLibrary?: boolean }>,
): Promise<ContextItem[]> {
  const screenshots: ContextItem[] = [];
  for (const attachment of attachments) {
    if (attachment.type !== "screenshot") continue;
    const item = await getContextItem(attachment.id);
    if (item?.type === "screenshot") {
      screenshots.push(item);
    }
  }
  return screenshots;
}
