/**
 * Durable session audio file paths (testable without Electron).
 */

import { join } from "node:path";
import { sanitizeSessionId } from "./sessionScreenshotUrls.ts";

export function sessionAudioRoot(userDataPath: string): string {
  return join(userDataPath, "session-audio");
}

export function sessionAudioDir(userDataPath: string, sessionId: string): string {
  return join(sessionAudioRoot(userDataPath), sanitizeSessionId(sessionId));
}

export function sessionAudioChunkPath(
  userDataPath: string,
  sessionId: string,
  eventId: string,
  ext = "webm",
): { dir: string; fullPath: string } {
  const safeSession = sanitizeSessionId(sessionId);
  const safeEvent = sanitizeSessionId(eventId);
  const dir = join(sessionAudioRoot(userDataPath), safeSession);
  return {
    dir,
    fullPath: join(dir, `${safeEvent}.${ext}`),
  };
}

export function audioExtensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "application/octet-stream";
  if (base.includes("webm")) return "webm";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("wav")) return "wav";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  return "webm";
}
