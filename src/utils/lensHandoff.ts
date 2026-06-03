/** URL params for IIVO Lens → app handoff. */

export interface LensHandoffParams {
  lensContextId?: string;
  lensAsk?: string;
}

export interface PendingLensHandoff {
  contextId: string;
  lensAsk: boolean;
}

export const LENS_HANDOFF_ATTACH_ERROR =
  "IIVO Lens context could not be attached. It may have been deleted.";

export function parseLensHandoffParams(
  search = typeof window !== "undefined" ? window.location.search : "",
): LensHandoffParams {
  const params = new URLSearchParams(search);
  const lensContextId = params.get("lensContextId")?.trim() || undefined;
  const lensAsk = params.get("lensAsk")?.trim() || undefined;
  return { lensContextId, lensAsk };
}

/** Read lens handoff from the current URL once (survives param cleanup after attach). */
export function readPendingLensHandoff(
  search = typeof window !== "undefined" ? window.location.search : "",
): PendingLensHandoff | null {
  const { lensContextId, lensAsk } = parseLensHandoffParams(search);
  const contextId = lensAsk ?? lensContextId;
  if (!contextId) return null;
  return { contextId, lensAsk: Boolean(lensAsk) };
}

export function clearLensHandoffParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("lensContextId");
  url.searchParams.delete("lensAsk");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}
