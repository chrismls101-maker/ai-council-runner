import type { ContextItem } from "./types.js";

export const LENS_CAPTURED_VIA = "browser_lens";
export const LENS_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LensCaptureType = "page" | "selection" | "evidence" | "screenshot";

export function findRecentLensDuplicate(
  items: ContextItem[],
  sourceUrl: string,
  options?: { now?: number; windowMs?: number },
): ContextItem | undefined {
  const now = options?.now ?? Date.now();
  const windowMs = options?.windowMs ?? LENS_DUPLICATE_WINDOW_MS;
  const cutoff = now - windowMs;
  const normalizedUrl = sourceUrl.trim();

  return items.find((item) => {
    if (item.capturedVia !== LENS_CAPTURED_VIA) return false;
    if (item.sourceUrl?.trim() !== normalizedUrl) return false;
    const ts = item.capturedAt ?? item.createdAt;
    const capturedMs = Date.parse(ts);
    if (Number.isNaN(capturedMs)) return false;
    return capturedMs >= cutoff;
  });
}

export function resolveLensCaptureType(item: Pick<ContextItem, "type" | "tags" | "lensCaptureType">): LensCaptureType | null {
  if (item.lensCaptureType) return item.lensCaptureType;
  if (item.type === "screenshot") return "screenshot";
  if (item.type === "evidence") return "evidence";
  if (item.tags.includes("selected-text") && !item.tags.includes("page-context")) {
    return "selection";
  }
  if (item.tags.includes("page-context") || item.type === "url") return "page";
  if (item.tags.includes("selected-text")) return "selection";
  return null;
}
