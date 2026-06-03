/**
 * Pure screenshot ID + URL helpers (safe for renderer and main).
 */

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export function sanitizeSessionId(id: string): string {
  if (SAFE_ID.test(id)) return id;
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function buildScreenshotThumbnailUrl(sessionId: string, eventId: string): string {
  return `glass-screenshot://${sanitizeSessionId(sessionId)}/${sanitizeSessionId(eventId)}.thumb.png`;
}
