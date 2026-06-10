/**
 * IIVO Glass Lens — browser page context for command-bar asks.
 */

export interface GlassLensContext {
  url: string;
  title: string;
  text: string;
  screenshot: string;
}

export interface GlassLensCaptureResult {
  url: string;
  title: string;
  text: string;
  screenshot?: string;
  error?: string;
}

export interface GlassLensScreenshotResult {
  screenshot?: string;
  error?: string;
}

export function lensFaviconUrl(url: string): string | undefined {
  const host = lensContextHostname(url);
  if (!host || host === "page") return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

export function lensContextHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    const trimmed = url.trim();
    return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed || "page";
  }
}

export function buildGlassLensContextBlock(
  lens?: Pick<GlassLensContext, "url" | "title" | "text">,
): string | undefined {
  if (!lens?.url?.trim() && !lens?.title?.trim() && !lens?.text?.trim()) return undefined;
  const lines = ["Browser page context (IIVO Lens):"];
  if (lens.title?.trim()) lines.push(`Title: ${lens.title.trim()}`);
  if (lens.url?.trim()) lines.push(`URL: ${lens.url.trim()}`);
  if (lens.text?.trim()) {
    lines.push("", "Page text (extract):", lens.text.trim().slice(0, 5000));
  }
  return lines.join("\n");
}
