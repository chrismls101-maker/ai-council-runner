/**
 * dockLabels.ts — Centralised label strings for the Glass dock.
 *
 * Keeps button copy in one place so it can be referenced by tests,
 * accessibility attributes, and any future icon-only / tooltip rendering
 * without duplicating strings throughout Dock.tsx.
 */

/** Every named action slot in the dock. */
export type DockActionKey =
  | "start-session"
  | "pause-session"
  | "resume-session"
  | "end-session"
  | "open-panel"
  | "close-panel"
  | "stop-everything"
  | "stop-listening"
  | "capture"
  | "show-overlay"
  | "hide-overlay"
  | "chrome-lock"
  | "chrome-unlock"
  | "orientation-to-horizontal"
  | "orientation-to-vertical"
  | "more-actions"
  | "overlay-mode"
  | "analyze-now"
  | "send-session"
  | "open-in-iivo";

/** Human-readable label for each dock action. */
export const DOCK_LABELS: Record<DockActionKey, string> = {
  "start-session": "Start Session",
  "pause-session": "Pause",
  "resume-session": "Resume",
  "end-session": "End",
  "open-panel": "Open Panel",
  "close-panel": "Close Panel",
  "stop-everything": "Stop Everything",
  "stop-listening": "Stop Listening",
  "capture": "Capture",
  "show-overlay": "Show Overlay",
  "hide-overlay": "Hide Overlay",
  "chrome-lock": "Lock layout",
  "chrome-unlock": "Unlock layout",
  "orientation-to-horizontal": "Switch to horizontal dock",
  "orientation-to-vertical": "Switch to vertical dock",
  "more-actions": "More actions",
  "overlay-mode": "Overlay mode",
  "analyze-now": "Analyze Now",
  "send-session": "Send Session",
  "open-in-iivo": "Open in IIVO",
};

// ─── Conditional label helpers ────────────────────────────────────────────────

/** Panel toggle label based on current visibility. */
export function resolvePanelLabel(panelVisible: boolean): string {
  return panelVisible ? DOCK_LABELS["close-panel"] : DOCK_LABELS["open-panel"];
}

/** Overlay toggle label based on current visibility. */
export function resolveOverlayLabel(overlayVisible: boolean): string {
  return overlayVisible ? DOCK_LABELS["hide-overlay"] : DOCK_LABELS["show-overlay"];
}

/** Chrome lock toggle label and aria-label. */
export function resolveChromeLockLabel(locked: boolean): string {
  return locked ? DOCK_LABELS["chrome-unlock"] : DOCK_LABELS["chrome-lock"];
}

/** Dock orientation toggle label. */
export function resolveDockOrientationLabel(vertical: boolean): string {
  return vertical
    ? DOCK_LABELS["orientation-to-horizontal"]
    : DOCK_LABELS["orientation-to-vertical"];
}

/** "Send Session" vs "Send to IIVO" depending on whether a session is active. */
export function resolveSendLabel(hasSession: boolean): string {
  return hasSession ? DOCK_LABELS["send-session"] : "Send to IIVO";
}
