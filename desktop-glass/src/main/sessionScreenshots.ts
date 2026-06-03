/**
 * Saves session capture PNGs + thumbnails under userData/session-screenshots/.
 */

import { promises as fs } from "node:fs";
import { nativeImage } from "electron";
import { app } from "electron";
import {
  parseDataUrl,
  sessionScreenshotDir,
  sessionScreenshotPaths,
} from "../shared/sessionScreenshotPaths.ts";
import type { GlassSessionEvent } from "../shared/sessionTypes.ts";

const THUMB_WIDTH = 320;

export interface SavedScreenshotRefs {
  screenshotPath: string;
  thumbnailPath: string;
  screenshotMimeType: string;
  screenshotSizeBytes: number;
}

export async function saveSessionScreenshot(
  sessionId: string,
  eventId: string,
  imageDataUrl: string,
): Promise<SavedScreenshotRefs> {
  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) throw new Error("Invalid screenshot data URL.");

  const { fullPath, thumbnailPath, dir } = sessionScreenshotPaths(
    app.getPath("userData"),
    sessionId,
    eventId,
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, parsed.buffer);

  const image = nativeImage.createFromBuffer(parsed.buffer);
  const size = image.getSize();
  const scale = size.width > THUMB_WIDTH ? THUMB_WIDTH / size.width : 1;
  const thumb = image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  });
  await fs.writeFile(thumbnailPath, thumb.toPNG());

  return {
    screenshotPath: fullPath,
    thumbnailPath,
    screenshotMimeType: parsed.mimeType,
    screenshotSizeBytes: parsed.buffer.length,
  };
}

export async function readScreenshotDataUrl(event: GlassSessionEvent): Promise<string | null> {
  const path = event.screenshotPath;
  if (!path) return event.screenshotDataUrl ?? null;
  try {
    const buf = await fs.readFile(path);
    const mime = event.screenshotMimeType ?? "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return event.screenshotDataUrl ?? null;
  }
}

export async function deleteScreenshotFiles(event: GlassSessionEvent): Promise<void> {
  const paths = [event.screenshotPath, event.thumbnailPath].filter(Boolean) as string[];
  for (const p of paths) {
    try {
      await fs.unlink(p);
    } catch {
      /* missing file is fine */
    }
  }
}

export async function clearSessionScreenshotFolder(sessionId: string): Promise<void> {
  const dir = sessionScreenshotDir(app.getPath("userData"), sessionId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* missing folder is fine */
  }
}

export function resolveThumbnailFilePath(urlPath: string): string | null {
  // glass-screenshot://sessionId/eventId.thumb.png
  const match = /^\/([^/]+)\/([^/]+\.thumb\.png)$/.exec(urlPath);
  if (!match) return null;
  const [, sessionId, fileName] = match;
  return `${sessionScreenshotDir(app.getPath("userData"), sessionId)}/${fileName}`;
}
