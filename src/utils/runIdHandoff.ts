/** URL param for opening a saved council/history run (?runId=). */

export const RUN_ID_HANDOFF_ERROR =
  "That run could not be loaded. It may have been deleted or the link is invalid.";

export function parseRunIdParam(
  search = typeof window !== "undefined" ? window.location.search : "",
): string | undefined {
  const params = new URLSearchParams(search);
  const runId = params.get("runId")?.trim();
  return runId || undefined;
}

/** Read runId from the current URL once (survives param cleanup after load). */
export function readPendingRunIdHandoff(
  search = typeof window !== "undefined" ? window.location.search : "",
): string | null {
  return parseRunIdParam(search) ?? null;
}

export function clearRunIdParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("runId");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}
