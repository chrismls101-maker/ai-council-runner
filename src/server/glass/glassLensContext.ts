/**
 * IIVO Glass Lens — browser page context on /api/glass/ask.
 */

export interface GlassAskLensContext {
  url: string;
  title: string;
  text: string;
  screenshot?: string;
}

export function buildGlassLensContextBlock(lens?: GlassAskLensContext): string | undefined {
  if (!lens?.url?.trim() && !lens?.title?.trim() && !lens?.text?.trim()) return undefined;
  const lines = ["Browser page context (IIVO Lens):"];
  if (lens.title?.trim()) lines.push(`Title: ${lens.title.trim()}`);
  if (lens.url?.trim()) lines.push(`URL: ${lens.url.trim()}`);
  if (lens.text?.trim()) {
    lines.push("", "Page text (extract):", lens.text.trim().slice(0, 5000));
  }
  return lines.join("\n");
}
