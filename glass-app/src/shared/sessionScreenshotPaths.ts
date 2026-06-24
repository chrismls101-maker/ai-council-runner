/**
 * Pure path helpers for durable session screenshot files (testable without Electron).
 */

import { join } from "node:path";
import { sanitizeSessionId } from "./sessionScreenshotUrls.ts";

export { sanitizeSessionId, buildScreenshotThumbnailUrl } from "./sessionScreenshotUrls.ts";

export function sessionScreenshotsRoot(userDataPath: string): string {
  return join(userDataPath, "session-screenshots");
}

export function sessionScreenshotDir(userDataPath: string, sessionId: string): string {
  return join(sessionScreenshotsRoot(userDataPath), sanitizeSessionId(sessionId));
}

export function sessionScreenshotPaths(
  userDataPath: string,
  sessionId: string,
  eventId: string,
): { fullPath: string; thumbnailPath: string; dir: string } {
  const safeSession = sanitizeSessionId(sessionId);
  const safeEvent = sanitizeSessionId(eventId);
  const dir = join(sessionScreenshotsRoot(userDataPath), safeSession);
  return {
    dir,
    fullPath: join(dir, `${safeEvent}.png`),
    thumbnailPath: join(dir, `${safeEvent}.thumb.png`),
  };
}

export function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}
