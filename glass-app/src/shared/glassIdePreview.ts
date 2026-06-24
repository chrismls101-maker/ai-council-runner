/** Dev-server URL patterns from Vite, Next, CRA, webpack, etc. */
const DEV_SERVER_URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:\/[^\s"'<>]*)?/gi;

const ALLOWED_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Strip ANSI and OSC sequences before scanning terminal text. */
export function stripTerminalNoise(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\r/g, "");
}

/** Pick the first localhost dev-server URL in terminal output. */
export function parseDevServerUrl(text: string): string | null {
  const clean = stripTerminalNoise(text);
  DEV_SERVER_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DEV_SERVER_URL_RE.exec(clean)) !== null) {
    const candidate = normalizePreviewUrl(match[0]);
    if (candidate && isAllowedPreviewUrl(candidate)) return candidate;
  }
  return null;
}

export function normalizePreviewUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[.,;)\]}>]+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!ALLOWED_PREVIEW_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isAllowedPreviewUrl(url: string): boolean {
  return normalizePreviewUrl(url) !== null;
}
