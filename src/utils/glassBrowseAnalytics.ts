export type GlassBrowseClientEvent =
  | "page_view"
  | "entered"
  | "command"
  | "auto_exit"
  | "manual_exit"
  | "mobile_preview";

export type GlassBrowseExitSource = "manual_button" | "escape" | "auto";

const SESSION_PAGE_VIEW_KEY = "iivo_glass_browse_page_view";

/** Fire-and-forget landing Glass mode analytics (server JSONL). */
export function trackGlassBrowseEvent(
  event: GlassBrowseClientEvent,
  metadata?: Record<string, string>,
): void {
  void fetch("/api/landing/glass-browse/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {
    /* analytics must not block UX */
  });
}

/** Once per browser session — enables enter-rate on the server. */
export function trackGlassBrowsePageViewOnce(): void {
  try {
    if (sessionStorage.getItem(SESSION_PAGE_VIEW_KEY) === "1") return;
    sessionStorage.setItem(SESSION_PAGE_VIEW_KEY, "1");
  } catch {
    /* private mode */
  }
  trackGlassBrowseEvent("page_view");
}

export function glassBrowseExitMetadata(
  source: GlassBrowseExitSource,
): Record<string, string> {
  return { source };
}

export type GlassBrowseCommandCategory =
  | "download"
  | "agents"
  | "privacy"
  | "launch"
  | "memory"
  | "build_loop"
  | "general";
