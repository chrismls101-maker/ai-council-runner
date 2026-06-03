/**
 * Master QA API fixtures — Lens page context + screenshots.
 */

import { qaLog } from "./qaEnv.js";
import { API_BASE } from "./qaStepHelpers.js";

export const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function createLensPageContextItem(
  title: string,
  options?: { contentText?: string; sourceUrl?: string },
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "url",
      title,
      sourceUrl: options?.sourceUrl ?? "https://example.com/lens-qa",
      contentText:
        options?.contentText ??
        "IIVO Lens handoff test content for founders and operators.",
      tags: ["lens", "browser", "page-context"],
      capturedVia: "browser_lens",
      capturedAt: new Date().toISOString(),
      sourceConfidence: "imported_url",
      lensCaptureType: "page",
    }),
  });
  if (!res.ok) throw new Error("Failed to create Lens page context fixture");
  const item = (await res.json()) as { id: string };
  qaLog(`[Master QA] Lens page fixture id=${item.id} title="${title}"`);
  return item.id;
}

export async function createLensScreenshotItem(
  title: string,
  options?: { sourceUrl?: string; contentText?: string },
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "screenshot",
      title,
      sourceUrl: options?.sourceUrl ?? "https://www.design.com/",
      contentText:
        options?.contentText ??
        `Screenshot captured from page: ${title}. Visible tab capture for vision QA.`,
      tags: ["lens", "browser", "screenshot"],
      capturedVia: "browser_lens",
      capturedAt: new Date().toISOString(),
      sourceConfidence: "screenshot",
      lensCaptureType: "screenshot",
      captureType: "visible_tab_screenshot",
      pageTitle: title,
    }),
  });
  if (!res.ok) throw new Error("Failed to create screenshot context fixture");
  const item = (await res.json()) as { id: string };

  const upload = await fetch(`${API_BASE}/api/context/${item.id}/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: TINY_PNG }),
  });
  if (!upload.ok) throw new Error("Failed to upload screenshot fixture");

  qaLog(`[Master QA] Screenshot fixture id=${item.id} title="${title}"`);
  return item.id;
}

export async function deleteContextItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/context/${id}`, { method: "DELETE" });
}
